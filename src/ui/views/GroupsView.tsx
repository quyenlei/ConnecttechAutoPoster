import { useMemo, useState } from 'react';
import { addJoinedGroups, filterGroups, hasPlaceholderName, parseGroupList, previewJoinedGroups } from '@/lib/groups';
import { LIMITS } from '@/lib/limits';
import { campaignsItem, groupsItem, joinedScanItem } from '@/lib/storage';
import type { Group } from '@/lib/types';
import { sendCommand, useItem } from '../hooks';

/** A scan still marked running long after its time limit was interrupted (browser or worker restart). */
const STALE_SCAN_MS = LIMITS.joinedScanTimeoutMs + 5 * 60_000;

/** Opt-in: reads the groups the user joined on Facebook, shows them, and adds only the ones the user ticks. */
function JoinedGroups({ groups }: { groups: Group[] }) {
  const scan = useItem(joinedScanItem) ?? null;
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<{ text: string; danger: boolean } | null>(null);
  const running = scan?.status === 'running' && Date.now() - scan.at < STALE_SCAN_MS;
  const rows = useMemo(() => (scan?.status === 'done' ? previewJoinedGroups(groups, scan.groups) : []), [scan, groups]);
  const fresh = rows.filter((r) => !r.exists);
  const shown = useMemo(() => {
    const visible = new Set(filterGroups(rows.map((r) => ({ id: r.id, name: r.name, url: r.url })), query).map((g) => g.id));
    return rows.filter((r) => visible.has(r.id));
  }, [rows, query]);

  async function start() {
    if (!window.confirm('CAP sẽ mở trang "Nhóm bạn đã tham gia" của Facebook thành một tab trong cửa sổ này, cuộn để đọc danh sách, rồi đóng tab và quay lại đây. Không vào nhóm nào và không bấm gì. Tiếp tục?')) return;
    setChosen(new Set());
    const reply = await sendCommand({ type: 'cap/run/fetch-joined' });
    setMessage(reply.ok ? null : { text: reply.error ?? 'Không thể bắt đầu.', danger: true });
  }

  function toggle(id: string, on: boolean) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function addChosen() {
    const current = await groupsItem.getValue();
    const next = addJoinedGroups(current, rows, chosen);
    await groupsItem.setValue(next);
    setMessage({ text: `Đã thêm ${next.length - current.length} nhóm.`, danger: false });
    setChosen(new Set());
  }

  return (
    <section className="card" aria-labelledby="joined-title">
      <div className="card__head">
        <h2 id="joined-title">Nhóm bạn đã tham gia trên Facebook</h2>
        <button className="button button--small" type="button" onClick={start} disabled={running}>
          {running ? 'Đang đọc danh sách…' : 'Lấy danh sách nhóm đã tham gia'}
        </button>
      </div>
      <div className="card__body">
        <p className="u-muted">
          Đọc mục “Tất cả các nhóm bạn đã tham gia” trên Facebook (không lấy nhóm đang chờ duyệt, không đọc thành viên). Bạn tự chọn nhóm nào được thêm. Danh sách không cho biết nhóm nào cho phép đăng hoặc bình luận, nên hãy chọn lọc.
        </p>
        {message && <p className={message.danger ? 'notice notice--danger' : 'u-muted'} role="status">{message.text}</p>}
        {scan?.status === 'failed' && <p className="notice notice--danger" role="alert">Không đọc được danh sách: {scan.error}</p>}
        {scan?.status === 'running' && !running && <p className="notice" role="status">Lần đọc trước bị gián đoạn. Hãy bấm lại.</p>}
        {scan?.status === 'done' && (
          <div className="groups__joined">
            <p role="status">
              Tìm thấy {rows.length} nhóm{scan.expected !== undefined && scan.expected !== rows.length ? ` (Facebook ghi ${scan.expected})` : ''}, {fresh.length} nhóm chưa có trong danh sách.
            </p>
            <div className="groups__actions">
              <label className="u-sr-only" htmlFor="joined-filter">Lọc nhóm theo tên</label>
              <input id="joined-filter" className="field__control field__control--grow" type="search" placeholder="Lọc theo tên" value={query} onChange={(e) => setQuery(e.target.value)} />
              <button className="button button--small" type="button" onClick={() => setChosen(new Set([...chosen, ...shown.filter((r) => !r.exists).map((r) => r.id)]))}>Chọn tất cả nhóm mới đang hiện</button>
              <button className="button button--small" type="button" onClick={() => setChosen(new Set())} disabled={chosen.size === 0}>Bỏ chọn</button>
            </div>
            <div className="table__scroll groups__joined-list">
              <table className="table">
                <thead>
                  <tr>
                    <th className="table__cell table__cell--head" scope="col"><span className="u-sr-only">Chọn</span></th>
                    <th className="table__cell table__cell--head" scope="col">Tên</th>
                    <th className="table__cell table__cell--head" scope="col">Liên kết</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr className="table__row" key={r.id}>
                      <td className="table__cell">
                        {r.exists ? <span className="u-muted">Đã có</span> : (
                          <input type="checkbox" checked={chosen.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} aria-label={`Chọn ${r.name}`} />
                        )}
                      </td>
                      <td className="table__cell groups__joined-name">{r.name}</td>
                      <td className="table__cell"><a href={r.url} target="_blank" rel="noreferrer noopener" title={`Mở ${r.name} trên Facebook`}>{r.url}</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <button className="button button--primary" type="button" onClick={addChosen} disabled={chosen.size === 0}>
                Thêm {chosen.size} nhóm đã chọn
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function GroupsView() {
  const groups = useItem(groupsItem) ?? [];
  const [text, setText] = useState('');
  const [rejected, setRejected] = useState<string[]>([]);
  const [nameMessage, setNameMessage] = useState<{ text: string; danger: boolean } | null>(null);
  const unnamed = groups.filter(hasPlaceholderName).length;

  async function fetchNames() {
    const reply = await sendCommand({ type: 'cap/run/fetch-names' });
    setNameMessage(
      reply.ok
        ? { text: 'Đang mở từng nhóm trong tab nền để đọc tên. Tên sẽ tự hiện trong danh sách.', danger: false }
        : { text: reply.error ?? 'Không thể lấy tên nhóm.', danger: true },
    );
  }

  async function add() {
    const parsed = parseGroupList(text, groups);
    if (parsed.groups.length) await groupsItem.setValue([...groups, ...parsed.groups]);
    setRejected(parsed.rejected);
    setText(parsed.rejected.join('\n'));
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Xóa nhóm “${name}”? Nhóm cũng sẽ bị gỡ khỏi mọi chiến dịch.`)) return;
    await groupsItem.setValue(groups.filter((g) => g.id !== id));
    const campaigns = await campaignsItem.getValue();
    await campaignsItem.setValue(campaigns.map((c) => ({ ...c, groupIds: c.groupIds.filter((g) => g !== id) })));
  }

  return (
    <div className="shell__stack">
      <section className="card">
        <div className="card__head">
          <h2>Thêm nhóm</h2>
        </div>
        <div className="card__body">
          <div className="field">
            <label className="field__label" htmlFor="group-list">Liên kết nhóm</label>
            <textarea
              id="group-list"
              className="field__control field__control--area"
              value={text}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setText(e.target.value)}
              placeholder={'https://www.facebook.com/groups/example | Tên nhóm của tôi\nhttps://www.facebook.com/groups/123456789'}
            />
            <span className="field__hint">
              Mỗi dòng một liên kết, có thể thêm “| tên nhóm” phía sau. Chỉ dùng các nhóm bạn đã tham gia. Liên kết chỉ được lưu trên thiết bị này.
            </span>
          </div>
          {rejected.length > 0 && (
            <p className="notice notice--danger" role="alert">
              {rejected.length} dòng không phải liên kết nhóm Facebook nên không được thêm.
            </p>
          )}
          <div>
            <button className="button button--primary" type="button" onClick={add} disabled={!text.trim()}>
              Thêm nhóm
            </button>
          </div>
        </div>
      </section>

      <JoinedGroups groups={groups} />

      <section className="card">
        <div className="card__head">
          <h2>Nhóm của bạn ({groups.length})</h2>
          {unnamed > 0 && (
            <button className="button button--small" type="button" onClick={fetchNames}>
              Lấy tên nhóm ({unnamed})
            </button>
          )}
        </div>
        {nameMessage && <p className={nameMessage.danger ? 'notice notice--danger' : 'u-muted'} role="status">{nameMessage.text}</p>}
        {groups.length === 0 ? (
          <p className="u-muted">Chưa có nhóm nào.</p>
        ) : (
          <div className="table__scroll">
            <table className="table">
              <thead>
                <tr>
                  <th className="table__cell table__cell--head" scope="col">Tên</th>
                  <th className="table__cell table__cell--head" scope="col">Liên kết</th>
                  <th className="table__cell table__cell--head" scope="col"><span className="u-sr-only">Thao tác</span></th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr className="table__row" key={g.id}>
                    <td className="table__cell">{g.name}</td>
                    <td className="table__cell"><a href={g.url} target="_blank" rel="noreferrer noopener" title={`Mở ${g.name} trên Facebook`}>{g.url}</a></td>
                    <td className="table__cell">
                      <button className="button button--small button--danger" type="button" onClick={() => remove(g.id, g.name)} aria-label={`Xóa ${g.name}`}>
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
