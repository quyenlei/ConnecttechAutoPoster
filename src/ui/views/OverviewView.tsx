import { useMemo } from 'react';
import { summarize, type Tally } from '@/lib/stats';
import { DEFAULT_SETTINGS, logsItem, settingsItem } from '@/lib/storage';
import { useItem } from '../hooks';

const percent = (rate: number | null): string => (rate === null ? '—' : `${Math.round(rate * 100)}%`);

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="overview__stat">
      <dt className="overview__stat-label">{label}</dt>
      <dd className="overview__stat-value">{value}</dd>
      {hint && <dd className="overview__stat-hint">{hint}</dd>}
    </div>
  );
}

function pendingHint(t: Tally): string | undefined {
  return t.pending > 0 ? `${t.pending} đang chờ duyệt` : undefined;
}

export function OverviewView() {
  const logs = useItem(logsItem);
  const settings = useItem(settingsItem) ?? DEFAULT_SETTINGS;
  const summary = useMemo(() => summarize(logs ?? [], Date.now()), [logs]);

  return (
    <div className="shell__stack">
      <section className="card" aria-labelledby="overview-today">
        <div className="card__head">
          <h2 id="overview-today">Hôm nay</h2>
        </div>
        <dl className="overview__stats">
          <Stat label="Đã gửi" value={summary.today.sent} hint={pendingHint(summary.today)} />
          <Stat label="Thất bại" value={summary.today.failed} />
          <Stat label="Tỉ lệ thành công" value={percent(summary.today.successRate)} />
        </dl>
      </section>

      <section className="card" aria-labelledby="overview-week">
        <div className="card__head">
          <h2 id="overview-week">7 ngày gần nhất</h2>
        </div>
        <dl className="overview__stats">
          <Stat label="Đã gửi" value={summary.last7Days.sent} hint={pendingHint(summary.last7Days)} />
          <Stat label="Thất bại" value={summary.last7Days.failed} />
          <Stat label="Tỉ lệ thành công" value={percent(summary.last7Days.successRate)} />
        </dl>
        <p className="u-muted">
          Tính từ nhật ký (tối đa 2000 dòng gần nhất), gồm cả bài đăng và bình luận. Nhóm bị bỏ qua không tính vào tỉ lệ.
        </p>
      </section>

      <section className="card" aria-labelledby="overview-notify">
        <div className="card__head">
          <h2 id="overview-notify">Thông báo</h2>
        </div>
        <label className="overview__option">
          <input
            type="checkbox"
            checked={settings.notifyOnFinish}
            onChange={(e) => void settingsItem.setValue({ ...settings, notifyOnFinish: e.target.checked })}
          />
          Thông báo trên máy khi chiến dịch hoàn tất, tạm dừng hoặc bị chặn
        </label>
        <p className="u-muted">
          Thông báo chỉ gồm tên chiến dịch và số lượng, không có nội dung bài đăng. Mặc định tắt.
        </p>
      </section>
    </div>
  );
}
