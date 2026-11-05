import { useEffect, useMemo, useState } from 'react';
import { delayWarning, formatDuration, recommendDelay } from '@/lib/delay';
import { newId } from '@/lib/id';
import { DEFAULT_SAFETY_BREAK, LIMITS } from '@/lib/limits';
import { isActive } from '@/lib/run-engine';
import { campaignsItem, groupsItem, runItem } from '@/lib/storage';
import type { Campaign } from '@/lib/types';
import { sendCommand, useItem } from '../hooks';

const blank = (): Campaign => ({
  id: newId(),
  name: 'Chiến dịch mới',
  variations: [''],
  groupIds: [],
  delay: recommendDelay(10),
  safetyBreak: { ...DEFAULT_SAFETY_BREAK },
  createdAt: Date.now(),
});

const num = (v: string) => (v === '' ? 0 : Number(v));

export function CampaignsView() {
  const campaigns = useItem(campaignsItem) ?? [];
  const groups = useItem(groupsItem) ?? [];
  const run = useItem(runItem);
  const [draft, setDraft] = useState<Campaign | null>(null);
  const [message, setMessage] = useState<{ text: string; danger: boolean } | null>(null);

  useEffect(() => {
    if (!draft && campaigns[0]) setDraft(campaigns[0]);
  }, [campaigns, draft]);

  const saved = draft ? campaigns.some((c) => c.id === draft.id) : false;
  const busy = run ? isActive(run) : false;
  const warning = draft ? delayWarning(draft.delay, draft.groupIds.length) : null;
  const totalSec = useMemo(() => {
    if (!draft || draft.groupIds.length < 2) return 0;
    return ((draft.delay.minSec + draft.delay.maxSec) / 2) * (draft.groupIds.length - 1);
  }, [draft]);

  function patch(p: Partial<Campaign>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setMessage(null);
  }

  async function save(): Promise<Campaign | null> {
    if (!draft) return null;
    const clean: Campaign = {
      ...draft,
      name: draft.name.trim() || 'Chiến dịch chưa đặt tên',
      variations: draft.variations.filter((v) => v.trim()).length ? draft.variations.filter((v) => v.trim()) : [''],
      delay: {
        minSec: Math.max(LIMITS.minDelaySec, draft.delay.minSec),
        maxSec: Math.max(LIMITS.minDelaySec, draft.delay.minSec, draft.delay.maxSec),
      },
    };
    const list = await campaignsItem.getValue();
    await campaignsItem.setValue(list.some((c) => c.id === clean.id) ? list.map((c) => (c.id === clean.id ? clean : c)) : [...list, clean]);
    setDraft(clean);
    setMessage({ text: 'Đã lưu.', danger: false });
    return clean;
  }

  async function launch() {
    const c = await save();
    if (!c) return;
    const reply = await sendCommand({ type: 'cap/run/start', campaignId: c.id });
    setMessage(reply.ok ? { text: 'Đã bắt đầu chạy. Bài đầu tiên sẽ được đăng ngay.', danger: false } : { text: reply.error ?? 'Không thể bắt đầu.', danger: true });
  }

  async function remove(id: string) {
    await campaignsItem.setValue(campaigns.filter((c) => c.id !== id));
    setDraft(null);
  }

  return (
    <div className="campaigns__layout">
      <section className="card" aria-label="Chiến dịch đã lưu">
        <div className="card__head">
          <h2>Chiến dịch</h2>
          <button className="button button--small" type="button" onClick={() => setDraft(blank())}>Tạo mới</button>
        </div>
        {campaigns.length === 0 && <p className="u-muted">Chưa có chiến dịch nào được lưu.</p>}
        <ul>
          {campaigns.map((c) => (
            <li key={c.id} className="campaigns__list-item">
              <button className="campaigns__list-name" type="button" aria-current={draft?.id === c.id} onClick={() => setDraft(c)}>
                {c.name}
              </button>
              <button className="button button--small button--danger" type="button" onClick={() => remove(c.id)} aria-label={`Xóa ${c.name}`} disabled={busy && run?.campaignId === c.id}>
                Xóa
              </button>
            </li>
          ))}
        </ul>
      </section>

      {draft ? (
        <section className="card" aria-label="Trình soạn chiến dịch">
          <div className="card__body">
            <div className="field">
              <label className="field__label" htmlFor="c-name">Tên chiến dịch</label>
              <input id="c-name" className="field__control" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
            </div>

            <div className="campaigns__variation">
              <h3>Nội dung bài đăng</h3>
              {draft.variations.map((v, i) => (
                <div className="field" key={i}>
                  <label className="field__label" htmlFor={`c-var-${i}`}>Phiên bản {i + 1}</label>
                  <textarea
                    id={`c-var-${i}`}
                    className="field__control field__control--area"
                    maxLength={LIMITS.maxPostLength}
                    value={v}
                    onChange={(e) => patch({ variations: draft.variations.map((x, j) => (j === i ? e.target.value : x)) })}
                  />
                  {draft.variations.length > 1 && (
                    <div>
                      <button className="button button--small" type="button" onClick={() => patch({ variations: draft.variations.filter((_, j) => j !== i) })}>
                        Xóa phiên bản {i + 1}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <div>
                <button className="button button--small" type="button" disabled={draft.variations.length >= LIMITS.maxVariations} onClick={() => patch({ variations: [...draft.variations, ''] })}>
                  Thêm phiên bản khác
                </button>
                <span className="field__hint"> Các phiên bản được luân phiên giữa các nhóm để bài đăng không giống hệt nhau.</span>
              </div>
            </div>

            <div>
              <h3>Nhóm (đã chọn {draft.groupIds.length})</h3>
              {groups.length === 0 ? (
                <p className="u-muted">Hãy thêm nhóm ở tab Nhóm trước.</p>
              ) : (
                <div className="campaigns__groups" role="group" aria-label="Chọn nhóm">
                  {groups.map((g) => (
                    <label className="campaigns__group" key={g.id}>
                      <input
                        type="checkbox"
                        checked={draft.groupIds.includes(g.id)}
                        onChange={(e) =>
                          patch({ groupIds: e.target.checked ? [...draft.groupIds, g.id].slice(0, LIMITS.maxGroupsPerCampaign) : draft.groupIds.filter((x) => x !== g.id) })
                        }
                      />
                      {g.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3>Thời gian và an toàn</h3>
              <div className="campaigns__row">
                <div className="field">
                  <label className="field__label" htmlFor="c-min">Chờ tối thiểu (giây)</label>
                  <input id="c-min" className="field__control" type="number" min={LIMITS.minDelaySec} max={LIMITS.maxDelaySec} value={draft.delay.minSec} onChange={(e) => patch({ delay: { ...draft.delay, minSec: num(e.target.value) } })} />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="c-max">Chờ tối đa (giây)</label>
                  <input id="c-max" className="field__control" type="number" min={LIMITS.minDelaySec} max={LIMITS.maxDelaySec} value={draft.delay.maxSec} onChange={(e) => patch({ delay: { ...draft.delay, maxSec: num(e.target.value) } })} />
                </div>
              </div>
              <p className="field__hint">
                Tối thiểu cho phép: {LIMITS.minDelaySec} giây. Khuyến nghị cho {draft.groupIds.length || 10} nhóm:{' '}
                {recommendDelay(draft.groupIds.length || 10).minSec}–{recommendDelay(draft.groupIds.length || 10).maxSec} giây.{' '}
                <button className="button button--small" type="button" onClick={() => patch({ delay: recommendDelay(draft.groupIds.length || 10) })}>Dùng mức khuyến nghị</button>
              </p>
              {warning === 'too-fast' && <p className="notice" role="alert">Tốc độ này nhanh hơn nhiều so với khuyến nghị và có thể khiến tài khoản của bạn bị hạn chế.</p>}
              {warning === 'fixed-time' && <p className="notice">Khoảng thời gian ngẫu nhiên trông tự nhiên hơn một mốc cố định.</p>}

              <label className="campaigns__group">
                <input type="checkbox" checked={draft.safetyBreak.enabled} onChange={(e) => patch({ safetyBreak: { ...draft.safetyBreak, enabled: e.target.checked } })} />
                Nghỉ an toàn: tự động tạm dừng
              </label>
              {draft.safetyBreak.enabled && (
                <div className="campaigns__row">
                  <div className="field">
                    <label className="field__label" htmlFor="c-every">Nghỉ sau số bài đăng</label>
                    <input id="c-every" className="field__control" type="number" min={1} max={100} value={draft.safetyBreak.everyPosts} onChange={(e) => patch({ safetyBreak: { ...draft.safetyBreak, everyPosts: Math.max(1, num(e.target.value)) } })} />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="c-break">Thời gian nghỉ (phút)</label>
                    <input id="c-break" className="field__control" type="number" min={1} max={240} value={draft.safetyBreak.breakMinutes} onChange={(e) => patch({ safetyBreak: { ...draft.safetyBreak, breakMinutes: Math.max(1, num(e.target.value)) } })} />
                  </div>
                </div>
              )}
              {totalSec > 0 && <p className="u-muted">Thời gian ước tính (chưa tính thời gian nghỉ): khoảng {formatDuration(totalSec)}.</p>}
            </div>

            {message && <p className={message.danger ? 'notice notice--danger' : 'u-muted'} role="status">{message.text}</p>}
            <div className="runbar__actions">
              <button className="button" type="button" onClick={() => void save()}>{saved ? 'Lưu thay đổi' : 'Lưu chiến dịch'}</button>
              <button className="button button--primary" type="button" onClick={launch} disabled={busy}>Lưu và chạy</button>
            </div>
          </div>
        </section>
      ) : (
        <section className="card"><p className="u-muted">Hãy tạo một chiến dịch để bắt đầu.</p></section>
      )}
    </div>
  );
}
