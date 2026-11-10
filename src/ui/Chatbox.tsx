import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { isActive } from '@/lib/run-engine';
import { campaignsItem, logsItem, runItem } from '@/lib/storage';
import { RunBar } from './RunBar';
import { useConfirm } from './confirm';
import { sendCommand, useItem } from './hooks';
import { LOG_STATUS_LABEL } from './labels';

/** How many of the newest log entries the chat box shows. */
const FEED_SIZE = 40;

const time = (ts: number) => new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * The small chat-style window shown on Facebook pages: run status and controls on top, the latest activity as
 * messages (newest at the bottom), and a campaign picker with a start button at the bottom.
 */
export function Chatbox() {
  const campaigns = useItem(campaignsItem) ?? [];
  const run = useItem(runItem);
  const logs = useItem(logsItem) ?? [];
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);
  const feedRef = useRef<HTMLOListElement>(null);
  const confirm = useConfirm();

  const recent = useMemo(() => logs.slice(-FEED_SIZE), [logs]);
  const lastId = recent[recent.length - 1]?.id;
  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [lastId]);

  const campaignId = campaigns.some((c) => c.id === selected) ? selected : (run?.campaignId && campaigns.some((c) => c.id === run.campaignId) ? run.campaignId : campaigns[0]?.id ?? '');
  const busy = run ? isActive(run) : false;

  async function start(event: FormEvent) {
    event.preventDefault();
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (!campaign) return;
    const what = campaign.mode === 'comment'
      ? `bình luận tối đa ${campaign.commentsPerGroup ?? 1} bài trong mỗi nhóm đã chọn`
      : `đăng vào ${campaign.groupIds.length} nhóm, bài đầu tiên đăng ngay`;
    const question = `Bắt đầu "${campaign.name}": ${what}? CAP chạy ngay trên tab này: tab sẽ tự chuyển qua từng nhóm và không đóng khi xong.`;
    if (!(await confirm(question, { okLabel: 'Bắt đầu chạy' }))) return;
    const reply = await sendCommand({ type: 'cap/run/start', campaignId: campaign.id });
    setError(reply.ok ? null : (reply.error ?? 'Không thể bắt đầu.'));
  }

  return (
    <main className="chatbox__app">
      <RunBar compact />
      <ol className="chatbox__feed" ref={feedRef} aria-label="Hoạt động gần đây" aria-live="polite">
        {recent.length === 0 && <li className="chatbox__empty">Chưa có hoạt động nào. Chọn chiến dịch bên dưới rồi bấm Chạy.</li>}
        {recent.map((entry) => (
          <li key={entry.id} className={`chatbox__message chatbox__message--${entry.status}`}>
            <span className="chatbox__meta">
              {time(entry.ts)} · {LOG_STATUS_LABEL[entry.status]}
              {entry.groupName && ` · ${entry.groupName}`}
            </span>
            <p className="chatbox__text">{entry.message}</p>
          </li>
        ))}
      </ol>
      {error && <p className="notice notice--danger chatbox__error" role="alert">{error}</p>}
      <form className="chatbox__composer" onSubmit={start}>
        <label className="u-sr-only" htmlFor="chatbox-campaign">Chiến dịch</label>
        <select id="chatbox-campaign" className="field__control chatbox__select" value={campaignId} onChange={(e) => setSelected(e.target.value)} disabled={campaigns.length === 0}>
          {campaigns.length === 0 && <option value="">Chưa có chiến dịch: bấm Mở rộng để tạo</option>}
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.mode === 'comment' ? 'bình luận' : 'đăng bài'})
            </option>
          ))}
        </select>
        <button className="button button--primary" type="submit" disabled={busy || !campaignId}>Chạy</button>
      </form>
    </main>
  );
}
