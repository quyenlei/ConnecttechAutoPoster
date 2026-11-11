import type { Progress } from '../api';

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Download progress while installing or updating CAP. */
export function Installing({ progress }: { progress: Progress | null }) {
  const value = progress?.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : null;
  return (
    <section className="screen" aria-labelledby="installing-title" aria-busy="true">
      <h1 id="installing-title" className="screen__title">Đang tải CAP…</h1>
      <p className="screen__lead">App tải từ trang phát hành chính thức và kiểm tra file trước khi cài. Đừng đóng app.</p>
      <div className="progress">
        <div className="progress__head">
          <span id="progress-cap">Connecttech Auto Poster</span>
          <span className="progress__value">{progress ? (value !== null ? `${value}%` : megabytes(progress.done)) : 'Đang chờ'}</span>
        </div>
        <progress className="progress__bar" aria-labelledby="progress-cap" max={100} value={value ?? undefined} />
      </div>
    </section>
  );
}
