import { useState } from 'react';
import { hasPlaceholderName, parseGroupList } from '@/lib/groups';
import { campaignsItem, groupsItem } from '@/lib/storage';
import { sendCommand, useItem } from '../hooks';

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

  async function remove(id: string) {
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
                  <tr key={g.id}>
                    <td className="table__cell">{g.name}</td>
                    <td className="table__cell"><a href={g.url} target="_blank" rel="noreferrer noopener" title={`Mở ${g.name} trên Facebook`}>{g.url}</a></td>
                    <td className="table__cell">
                      <button className="button button--small button--danger" type="button" onClick={() => remove(g.id)} aria-label={`Xóa ${g.name}`}>
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
