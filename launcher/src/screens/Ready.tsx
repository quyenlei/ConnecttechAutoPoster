import { openUrl } from '@tauri-apps/plugin-opener';
import { RELEASES_URL, type Status } from '../api';

interface Props {
  status: Status;
  onLaunch: () => void;
  onCheck: () => void;
  onGuide: () => void;
  onSettings: () => void;
  onAdopt: () => void;
}

/** Main screen once CAP is installed. */
export function Ready({ status, onLaunch, onCheck, onGuide, onSettings, onAdopt }: Props) {
  const browserMode = status.mode === 'browser';
  return (
    <section className="screen" aria-labelledby="ready-title">
      <h1 id="ready-title" className="screen__title">{browserMode ? 'CAP đã sẵn sàng' : 'CAP đã cài cho Chrome của bạn'}</h1>
      <dl className="facts">
        <div className="facts__row">
          <dt>Phiên bản CAP</dt>
          <dd>{status.capVersion ?? 'Chưa cài'}</dd>
        </div>
        {browserMode && (
          <div className="facts__row">
            <dt>Trình duyệt</dt>
            <dd>{status.browserVersion ?? 'Chưa cài'}{status.browserRunning ? ' (đang mở)' : ''}</dd>
          </div>
        )}
        <div className="facts__row">
          <dt>Bản mới nhất</dt>
          <dd>{status.latest ?? 'Chưa kiểm tra'}</dd>
        </div>
      </dl>

      {status.pendingUpdate !== null && (
        <p className="notice notice--accent" role="status">
          {status.pendingUpdate ? `Có bản mới ${status.pendingUpdate}.` : 'Có bản trình duyệt mới.'} Đóng cửa sổ trình duyệt của app,
          app sẽ tự cập nhật rồi bạn mở lại.
        </p>
      )}
      {!browserMode && (
        <>
          <p className="screen__lead">
            Mở CAP trong Chrome như bình thường. Khi app cập nhật, CAP tự tải lại lúc không có lượt chạy nào.
          </p>
          <p className="screen__lead">
            Thư mục app cập nhật: <code>{status.extensionPath}</code>. Nếu Chrome nạp CAP từ thư mục khác (xem <strong>Loaded from</strong> trong
            chi tiết CAP ở <code>chrome://extensions</code>), hãy chọn thư mục đó.
          </p>
        </>
      )}
      {status.appUpdate && (
        <p className="notice" role="status">
          Có bản app Connecttech mới.{' '}
          <button className="button button--link" type="button" onClick={() => void openUrl(status.appPageUrl ?? RELEASES_URL)}>
            Tải bộ cài mới
          </button>
        </p>
      )}

      <div className="screen__actions">
        {browserMode ? (
          <button className="button button--primary" type="button" onClick={onLaunch} disabled={status.busy || status.browserRunning}>
            {status.browserRunning ? 'CAP đang mở' : 'Mở CAP'}
          </button>
        ) : (
          <>
            <button className="button" type="button" onClick={onAdopt} disabled={status.busy}>Chọn thư mục CAP đang dùng</button>
            <button className="button" type="button" onClick={onGuide}>Xem lại hướng dẫn nạp CAP</button>
          </>
        )}
        <button className="button" type="button" onClick={onCheck} disabled={status.busy}>
          {status.busy ? 'Đang kiểm tra…' : 'Kiểm tra cập nhật'}
        </button>
        <button className="button button--link" type="button" onClick={onSettings}>Cài đặt</button>
      </div>
    </section>
  );
}
