import type { Mode, Progress } from '../api';

interface Props {
  mode: Mode;
  progress: Partial<Record<Progress['item'], Progress>>;
}

const LABELS: Record<Progress['item'], string> = { browser: 'Trình duyệt', cap: 'Connecttech Auto Poster' };

function percent(p?: Progress): number | null {
  if (!p?.total) return null;
  return Math.min(100, Math.round((p.done / p.total) * 100));
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Download progress while installing or updating. */
export function Installing({ mode, progress }: Props) {
  const items: Progress['item'][] = mode === 'browser' ? ['browser', 'cap'] : ['cap'];
  return (
    <section className="screen" aria-labelledby="installing-title" aria-busy="true">
      <h1 id="installing-title" className="screen__title">Đang tải về…</h1>
      <p className="screen__lead">App tải từ máy chủ chính thức và kiểm tra file trước khi cài. Đừng đóng app.</p>
      {items.map((item) => {
        const p = progress[item];
        const value = percent(p);
        return (
          <div className="progress" key={item}>
            <div className="progress__head">
              <span id={`progress-${item}`}>{LABELS[item]}</span>
              <span className="progress__value">{p ? (value !== null ? `${value}%` : megabytes(p.done)) : 'Đang chờ'}</span>
            </div>
            <progress className="progress__bar" aria-labelledby={`progress-${item}`} max={100} value={value ?? undefined} />
          </div>
        );
      })}
    </section>
  );
}
