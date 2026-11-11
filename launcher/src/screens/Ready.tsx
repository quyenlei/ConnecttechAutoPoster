import { openUrl } from '@tauri-apps/plugin-opener';
import { RELEASES_URL, type Status } from '../api';

interface Props {
  status: Status;
  onCheck: () => void;
  onGuide: () => void;
  onSettings: () => void;
  onAdopt: () => void;
}

/** Main screen once CAP is installed for the user's Chrome. */
export function Ready({ status, onCheck, onGuide, onSettings, onAdopt }: Props) {
  return (
    <section className="screen" aria-labelledby="ready-title">
      <h1 id="ready-title" className="screen__title">CAP đã cài cho Chrome của bạn</h1>
      <dl className="facts">
        <div className="facts__row">
          <dt>Phiên bản CAP trong thư mục</dt>
          <dd>{status.capVersion ?? 'Chưa cài'}</dd>
        </div>
        <div className="facts__row">
          <dt>Bản mới nhất</dt>
          <dd>{status.latest ?? 'Chưa kiểm tra'}</dd>
        </div>
        <div className="facts__row">
          <dt>Thư mục CAP</dt>
          <dd><code>{status.extensionPath}</code></dd>
        </div>
      </dl>
      <p className="screen__lead">
        Mở CAP trong Chrome như bình thường. Khi app cập nhật thư mục trên, CAP tự tải lại lúc không có lượt chạy nào
        (hoặc bấm ⟳ ở thẻ CAP trong <code>chrome://extensions</code> để áp dụng ngay).
      </p>
      {!status.customFolder && (
        <p className="notice">
          Chrome đang nạp CAP từ thư mục khác (xem <strong>Loaded from</strong> trong chi tiết CAP ở <code>chrome://extensions</code>)? Hãy bấm{' '}
          <strong>Chọn thư mục CAP đang dùng</strong> để app cập nhật đúng thư mục đó.
        </p>
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
        <button className="button button--primary" type="button" onClick={onCheck} disabled={status.busy}>
          {status.busy ? 'Đang kiểm tra…' : 'Kiểm tra cập nhật'}
        </button>
        <button className="button" type="button" onClick={onAdopt} disabled={status.busy}>Chọn thư mục CAP đang dùng</button>
        <button className="button" type="button" onClick={onGuide}>Xem lại hướng dẫn nạp CAP</button>
        <button className="button button--link" type="button" onClick={onSettings}>Cài đặt</button>
      </div>
    </section>
  );
}
