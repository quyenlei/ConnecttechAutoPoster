import { useState } from 'react';
import { formatDuration } from '@/lib/delay';
import { isActive } from '@/lib/run-engine';
import { campaignsItem, runItem } from '@/lib/storage';
import { sendCommand, useItem, useNow } from './hooks';
import { RUN_STATUS_LABEL } from './labels';

export function RunBar() {
  const run = useItem(runItem);
  const campaigns = useItem(campaignsItem);
  const now = useNow(run?.status === 'running');
  const [error, setError] = useState<string | null>(null);
  if (!run) return null;

  const campaign = campaigns?.find((c) => c.id === run.campaignId);
  const countdown = run.status === 'running' && run.nextAt ? Math.max(0, Math.round((run.nextAt - now) / 1000)) : null;

  async function act(type: 'cap/run/pause' | 'cap/run/resume' | 'cap/run/stop' | 'cap/run/reset') {
    const reply = await sendCommand({ type });
    setError(reply.ok ? null : (reply.error ?? 'Thao tác thất bại.'));
  }

  return (
    <section className="card" aria-label="Trạng thái chạy">
      <div className="runbar">
        <div className="runbar__text">
          <span className={`badge badge--${run.status}`}>{RUN_STATUS_LABEL[run.status]}</span>{' '}
          <strong>{campaign?.name ?? 'Chưa có lượt chạy nào'}</strong>
          {run.total > 0 && (
            <span className="u-muted">
              {' '}
              · {run.attempted}/{run.total} nhóm
              {countdown !== null && ` · bài tiếp theo sau ${formatDuration(countdown)}`}
            </span>
          )}
          {run.reason && <p className="u-muted">{run.reason}</p>}
        </div>
        {run.total > 0 && <progress className="runbar__progress" max={run.total} value={run.attempted} aria-label="Tiến độ đăng bài" />}
        <div className="runbar__actions">
          {run.status === 'running' && (
            <button className="button button--small" type="button" onClick={() => act('cap/run/pause')}>
              Tạm dừng
            </button>
          )}
          {run.status === 'paused' && (
            <button className="button button--small button--primary" type="button" onClick={() => act('cap/run/resume')}>
              Tiếp tục
            </button>
          )}
          {isActive(run) && (
            <button className="button button--small button--danger" type="button" onClick={() => act('cap/run/stop')}>
              Dừng
            </button>
          )}
          {!isActive(run) && run.status !== 'idle' && (
            <button className="button button--small" type="button" onClick={() => act('cap/run/reset')}>
              Xóa kết quả
            </button>
          )}
        </div>
      </div>
      {error && <p className="notice notice--danger" role="alert">{error}</p>}
    </section>
  );
}
