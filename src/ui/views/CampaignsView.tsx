import { useEffect, useMemo, useState } from 'react';
import { delayWarning, formatDuration, recommendDelay } from '@/lib/delay';
import { addToSelection, filterGroups, removeFromSelection } from '@/lib/groups';
import { newId } from '@/lib/id';
import { DEFAULT_SAFETY_BREAK, LIMITS } from '@/lib/limits';
import { isActive } from '@/lib/run-engine';
import { nextOccurrence, normalizeTimes, parseTime, validateTimes } from '@/lib/schedule';
import { campaignsItem, groupsItem, runItem } from '@/lib/storage';
import type { Campaign } from '@/lib/types';
import { sendCommand, useItem } from '../hooks';

const blank = (): Campaign => ({
  id: newId(),
  name: 'Chiến dịch mới',
  mode: 'post',
  commentsPerGroup: 5,
  variations: [''],
  groupIds: [],
  delay: recommendDelay(10),
  safetyBreak: { ...DEFAULT_SAFETY_BREAK },
  createdAt: Date.now(),
});

const DEFAULT_SCHEDULE = { enabled: false, times: [] as string[] };

/** A new time 12 hours after the last one, or 07:00 for the first. */
function suggestTime(times: string[]): string {
  const last = parseTime(times[times.length - 1] ?? '');
  const mins = last === null ? 7 * 60 : (last + 12 * 60) % (24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

const num = (v: string) => (v === '' ? 0 : Number(v));

const stripIdentity = (c: Campaign) => JSON.stringify({ ...c, id: '', createdAt: 0 });

export function CampaignsView() {
  const campaigns = useItem(campaignsItem) ?? [];
  const groups = useItem(groupsItem) ?? [];
  const run = useItem(runItem);
  const [draft, setDraft] = useState<Campaign | null>(null);
  const [groupQuery, setGroupQuery] = useState('');
  const [message, setMessage] = useState<{ text: string; danger: boolean } | null>(null);

  useEffect(() => {
    if (!draft && campaigns[0]) setDraft(campaigns[0]);
  }, [campaigns, draft]);

  const visibleGroups = useMemo(() => filterGroups(groups, groupQuery), [groups, groupQuery]);
  const dirty = useMemo(() => {
    if (!draft) return false;
    const stored = campaigns.find((c) => c.id === draft.id);
    return stored ? JSON.stringify(stored) !== JSON.stringify(draft) : stripIdentity(draft) !== stripIdentity(blank());
  }, [campaigns, draft]);
  const saved = draft ? campaigns.some((c) => c.id === draft.id) : false;
  const busy = run ? isActive(run) : false;
  const warning = draft ? delayWarning(draft.delay, draft.groupIds.length) : null;
  const totalSec = useMemo(() => {
    if (!draft) return 0;
    const attempts = draft.groupIds.length * (draft.mode === 'comment' ? (draft.commentsPerGroup ?? 0) : 1);
    if (attempts < 2) return 0;
    return ((draft.delay.minSec + draft.delay.maxSec) / 2) * (attempts - 1);
  }, [draft]);

  const schedule = draft?.schedule ?? DEFAULT_SCHEDULE;
  const scheduleTimes = normalizeTimes(schedule.times);
  const scheduleError = validateTimes(scheduleTimes);
  const scheduleBlocking = schedule.enabled ? scheduleError : null;
  const nextRun = schedule.enabled && !scheduleError ? nextOccurrence(scheduleTimes, Date.now()) : null;
  const variationCount = draft ? draft.variations.filter((v) => v.trim()).length : 0;

  function select(next: Campaign) {
    if (dirty && !window.confirm('Bạn có thay đổi chưa lưu. Bỏ thay đổi và tiếp tục?')) return;
    setDraft(next);
    setGroupQuery('');
    setMessage(null);
  }

  function patchSchedule(p: Partial<typeof DEFAULT_SCHEDULE>) {
    patch({ schedule: { ...schedule, ...p } });
  }

  function patch(p: Partial<Campaign>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setMessage(null);
  }

  async function save(): Promise<Campaign | null> {
    if (!draft) return null;
    if (busy && run?.campaignId === draft.id) {
      setMessage({ text: 'Hãy dừng lượt chạy trước khi sửa chiến dịch này.', danger: true });
      return null;
    }
    if (draft.mode === 'comment' && (!Number.isInteger(draft.commentsPerGroup) || (draft.commentsPerGroup ?? 0) < 1 || (draft.commentsPerGroup ?? 0) > LIMITS.maxCommentsPerGroup)) {
      setMessage({ text: `Số bài mỗi nhóm phải từ 1 đến ${LIMITS.maxCommentsPerGroup}.`, danger: true });
      return null;
    }
    if (scheduleBlocking) {
      setMessage({ text: scheduleBlocking, danger: true });
      return null;
    }
    const clean: Campaign = {
      ...draft,
      name: draft.name.trim() || 'Chiến dịch chưa đặt tên',
      variations: draft.variations.filter((v) => v.trim()).length ? draft.variations.filter((v) => v.trim()) : [''],
      delay: {
        minSec: Math.max(LIMITS.minDelaySec, draft.delay.minSec),
        maxSec: Math.max(LIMITS.minDelaySec, draft.delay.minSec, draft.delay.maxSec),
      },
      safetyBreak: {
        ...draft.safetyBreak,
        everyPosts: Math.min(100, Math.max(1, draft.safetyBreak.everyPosts)),
        breakMinutes: Math.min(240, Math.max(1, draft.safetyBreak.breakMinutes)),
      },
      schedule: { enabled: schedule.enabled, times: scheduleError ? [] : scheduleTimes },
    };
    const list = await campaignsItem.getValue();
    await campaignsItem.setValue(list.some((c) => c.id === clean.id) ? list.map((c) => (c.id === clean.id ? clean : c)) : [...list, clean]);
    setDraft(clean);
    setMessage({ text: 'Đã lưu.', danger: false });
    return clean;
  }

  async function launch() {
    if (!draft) return;
    if (!window.confirm(draft.mode === 'comment' ? `Bắt đầu bình luận tối đa ${draft.commentsPerGroup} bài trong mỗi nhóm đã chọn? Lượt đầu bắt đầu ngay.` : `Bắt đầu đăng vào ${draft.groupIds.length} nhóm ngay bây giờ? Bài đầu tiên sẽ được đăng ngay.`)) return;
    const c = await save();
    if (!c) return;
    const reply = await sendCommand({ type: 'cap/run/start', campaignId: c.id });
    setMessage(reply.ok ? { text: draft.mode === 'comment' ? 'Đã bắt đầu chiến dịch bình luận.' : 'Đã bắt đầu chạy. Bài đầu tiên sẽ được đăng ngay.', danger: false } : { text: reply.error ?? 'Không thể bắt đầu.', danger: true });
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Xóa chiến dịch “${name}”? Thao tác này không thể hoàn tác.`)) return;
    await campaignsItem.setValue(campaigns.filter((c) => c.id !== id));
    setDraft(null);
  }

  return (
    <div className="campaigns__layout">
      <section className="card campaigns__sidebar" aria-label="Chiến dịch đã lưu">
        <div className="card__head">
          <h2>Chiến dịch</h2>
          <button className="button button--small" type="button" onClick={() => select(blank())}>Tạo mới</button>
        </div>
        {campaigns.length === 0 && <p className="u-muted">Chưa có chiến dịch nào được lưu.</p>}
        <ul>
          {campaigns.map((c) => (
            <li key={c.id} className="campaigns__list-item">
              <button className="campaigns__list-name" type="button" aria-current={draft?.id === c.id} onClick={() => select(c)}>
                {c.name}
              </button>
              <button className="button button--small button--danger" type="button" onClick={() => remove(c.id, c.name)} aria-label={`Xóa ${c.name}`} disabled={busy && run?.campaignId === c.id}>
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

            <div className="field">
              <label className="field__label" htmlFor="c-mode">Loại chiến dịch</label>
              <select id="c-mode" className="field__control" value={draft.mode ?? 'post'} onChange={(e) => patch({ mode: e.target.value === 'comment' ? 'comment' : 'post' })} disabled={busy && run?.campaignId === draft.id}>
                <option value="post">Đăng bài vào nhóm</option>
                <option value="comment">Bình luận bài viết trong nhóm</option>
              </select>
            </div>
            {draft.mode === 'comment' && (
              <div className="field">
                <label className="field__label" htmlFor="c-comment-limit">Số bài tối đa mỗi nhóm</label>
                <input id="c-comment-limit" className="field__control" type="number" min={1} max={LIMITS.maxCommentsPerGroup} value={draft.commentsPerGroup ?? 5} onChange={(e) => patch({ commentsPerGroup: num(e.target.value) })} />
                <span className="field__hint">Chỉ xét bài có thời gian đăng xác định được trong 24 giờ qua. Bài đã xử lý sẽ không tự thử lại.</span>
              </div>
            )}

            <div className="campaigns__variation">
              <h3>{draft.mode === 'comment' ? 'Nội dung bình luận' : 'Nội dung bài đăng'}</h3>
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
                <span className="field__hint"> Các phiên bản được sử dụng luân phiên.</span>
              </div>
            </div>

            <div className="campaigns__section">
              <h3>Nhóm (đã chọn {draft.groupIds.length})</h3>
              {groups.length === 0 ? (
                <p className="u-muted">Hãy thêm nhóm ở tab Nhóm trước.</p>
              ) : (
                <>
                  <div className="campaigns__groups-tools">
                    <label className="u-sr-only" htmlFor="c-group-search">Tìm nhóm theo tên</label>
                    <input id="c-group-search" className="field__control field__control--grow" type="search" autoComplete="off" placeholder="Tìm nhóm theo tên" value={groupQuery} onChange={(e) => setGroupQuery(e.target.value)} />
                    <button className="button button--small" type="button" disabled={visibleGroups.length === 0} onClick={() => patch({ groupIds: addToSelection(draft.groupIds, visibleGroups.map((g) => g.id), LIMITS.maxGroupsPerCampaign) })}>
                      Chọn tất cả{groupQuery.trim() ? ' (đang lọc)' : ''}
                    </button>
                    <button className="button button--small" type="button" disabled={draft.groupIds.length === 0} onClick={() => patch({ groupIds: removeFromSelection(draft.groupIds, groupQuery.trim() ? visibleGroups.map((g) => g.id) : draft.groupIds) })}>
                      Bỏ chọn{groupQuery.trim() ? ' (đang lọc)' : ' tất cả'}
                    </button>
                  </div>
                  <div className="campaigns__groups" role="group" aria-label="Chọn nhóm">
                    {visibleGroups.length === 0 && <p className="u-muted">Không có nhóm nào khớp.</p>}
                    {visibleGroups.map((g) => (
                      <label className="campaigns__group" key={g.id}>
                        <input
                          type="checkbox"
                          checked={draft.groupIds.includes(g.id)}
                          onChange={(e) => patch({ groupIds: e.target.checked ? addToSelection(draft.groupIds, [g.id], LIMITS.maxGroupsPerCampaign) : removeFromSelection(draft.groupIds, [g.id]) })}
                        />
                        {g.name}
                      </label>
                    ))}
                  </div>
                  {draft.groupIds.length >= LIMITS.maxGroupsPerCampaign && <p className="field__hint">Đã đạt tối đa {LIMITS.maxGroupsPerCampaign} nhóm cho một chiến dịch.</p>}
                </>
              )}
            </div>

            <div className="campaigns__section">
              <h3>Thời gian và an toàn</h3>
              <div className="campaigns__row">
                <div className="field">
                  <label className="field__label" htmlFor="c-min">Chờ tối thiểu (giây)</label>
                  <input id="c-min" className="field__control" type="number" inputMode="numeric" autoComplete="off" min={LIMITS.minDelaySec} max={LIMITS.maxDelaySec} value={draft.delay.minSec || ''} onChange={(e) => patch({ delay: { ...draft.delay, minSec: num(e.target.value) } })} />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="c-max">Chờ tối đa (giây)</label>
                  <input id="c-max" className="field__control" type="number" inputMode="numeric" autoComplete="off" min={LIMITS.minDelaySec} max={LIMITS.maxDelaySec} value={draft.delay.maxSec || ''} onChange={(e) => patch({ delay: { ...draft.delay, maxSec: num(e.target.value) } })} />
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
                    <label className="field__label" htmlFor="c-every">Nghỉ sau số lượt thực hiện</label>
                    <input id="c-every" className="field__control" type="number" inputMode="numeric" autoComplete="off" min={1} max={100} value={draft.safetyBreak.everyPosts || ''} onChange={(e) => patch({ safetyBreak: { ...draft.safetyBreak, everyPosts: num(e.target.value) } })} />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="c-break">Thời gian nghỉ (phút)</label>
                    <input id="c-break" className="field__control" type="number" inputMode="numeric" autoComplete="off" min={1} max={240} value={draft.safetyBreak.breakMinutes || ''} onChange={(e) => patch({ safetyBreak: { ...draft.safetyBreak, breakMinutes: num(e.target.value) } })} />
                  </div>
                </div>
              )}
              {totalSec > 0 && <p className="u-muted">Thời gian ước tính (chưa tính thời gian nghỉ): khoảng {formatDuration(totalSec)}.</p>}

              <fieldset className="campaigns__schedule">
                <legend>Hẹn giờ chạy</legend>
                <label className="campaigns__group">
                  <input type="checkbox" checked={schedule.enabled} onChange={(e) => patchSchedule({ enabled: e.target.checked })} />
                  Tự động chạy chiến dịch này mỗi ngày
                </label>
                {schedule.enabled && (
                  <>
                    <ul className="campaigns__schedule-list">
                      {schedule.times.map((time, index) => (
                        <li className="campaigns__schedule-time" key={index}>
                          <label className="field__label" htmlFor={`c-time-${index}`}>Giờ chạy {index + 1}</label>
                          <input id={`c-time-${index}`} className="field__control" type="time" value={time} onChange={(e) => patchSchedule({ times: schedule.times.map((t, i) => (i === index ? e.target.value : t)) })} />
                          <button className="button button--small" type="button" aria-label={`Xóa giờ chạy ${index + 1}`} onClick={() => patchSchedule({ times: schedule.times.filter((_, i) => i !== index) })}>Xóa giờ</button>
                        </li>
                      ))}
                    </ul>
                    <button className="button button--small" type="button" disabled={schedule.times.length >= LIMITS.maxScheduleTimesPerDay} onClick={() => patchSchedule({ times: [...schedule.times, suggestTime(schedule.times)] })}>Thêm giờ</button>
                    <p className="field__hint">Tối đa {LIMITS.maxScheduleTimesPerDay} mốc mỗi ngày, cách nhau ít nhất {LIMITS.minScheduleGapMinutes / 60} giờ. Giờ theo máy của bạn.</p>
                    {scheduleError && <p className="notice notice--danger" role="alert">{scheduleError}</p>}
                    {nextRun !== null && <p className="u-muted">Lần chạy tiếp theo: {new Date(nextRun).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</p>}
                    {scheduleTimes.length >= 2 && variationCount < 2 && (
                      <p className="notice">Đăng cùng một nội dung nhiều lần trong ngày dễ bị coi là spam. Hãy thêm phiên bản nội dung.</p>
                    )}
                    <p className="field__hint">Chrome phải đang mở và đã đăng nhập Facebook thì lịch mới chạy.</p>
                  </>
                )}
              </fieldset>
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
