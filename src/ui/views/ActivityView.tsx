import { useMemo, useState } from 'react';
import { logsToCsv } from '@/lib/csv';
import { logsItem } from '@/lib/storage';
import type { LogStatus } from '@/lib/types';
import { useItem } from '../hooks';

const FILTERS: Array<LogStatus | 'all'> = ['all', 'posted', 'failed', 'skipped', 'break', 'info'];

const STATUS_LABEL: Record<LogStatus | 'all', string> = {
  all: 'Tất cả',
  posted: 'Đã đăng',
  failed: 'Thất bại',
  skipped: 'Đã bỏ qua',
  break: 'Nghỉ an toàn',
  info: 'Thông tin',
};

export function ActivityView() {
  const logs = useItem(logsItem) ?? [];
  const [filter, setFilter] = useState<LogStatus | 'all'>('all');
  const rows = useMemo(
    () => logs.filter((l) => filter === 'all' || l.status === filter).slice().reverse(),
    [logs, filter],
  );

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([logsToCsv(logs)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `cap-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="card">
      <div className="card__head">
        <h2>Nhật ký ({rows.length})</h2>
        <div className="runbar__actions">
          <label className="u-sr-only" htmlFor="log-filter">Lọc theo trạng thái</label>
          <select id="log-filter" className="field__control" value={filter} onChange={(e) => setFilter(e.target.value as LogStatus | 'all')}>
            {FILTERS.map((f) => (
              <option key={f} value={f}>{STATUS_LABEL[f]}</option>
            ))}
          </select>
          <button className="button" type="button" onClick={exportCsv} disabled={logs.length === 0}>Xuất CSV</button>
          <button className="button button--danger" type="button" onClick={() => logsItem.setValue([])} disabled={logs.length === 0}>Xóa nhật ký</button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="u-muted">Chưa có nhật ký nào.</p>
      ) : (
        <div className="table__scroll">
          <table className="table">
            <thead>
              <tr>
                <th className="table__cell table__cell--head" scope="col">Thời gian</th>
                <th className="table__cell table__cell--head" scope="col">Trạng thái</th>
                <th className="table__cell table__cell--head" scope="col">Nhóm</th>
                <th className="table__cell table__cell--head" scope="col">Nội dung</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td className="table__cell">{new Date(l.ts).toLocaleString('vi-VN')}</td>
                  <td className="table__cell"><span className={`badge badge--${l.status}`}>{STATUS_LABEL[l.status]}</span></td>
                  <td className="table__cell">{l.groupName || '—'}</td>
                  <td className="table__cell">{l.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
