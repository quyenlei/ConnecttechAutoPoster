import { useState } from 'react';
import { copy, errorMessage, openChrome } from '../api';

interface Props {
  extensionPath: string;
  onDone: () => void;
  /** CAP is already loaded in Chrome from another folder: keep that folder up to date instead. */
  onAdopt: () => void;
}

/** How to paste the folder path in Chrome's "Load unpacked" dialog on this system. */
function pasteHint(): string {
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) return 'Trong hộp thoại chọn thư mục, nhấn Cmd+Shift+G, dán (Cmd+V), Enter, rồi bấm Select.';
  if (/Windows/i.test(ua)) return 'Trong hộp thoại chọn thư mục, dán (Ctrl+V) vào ô địa chỉ ở trên, Enter, rồi bấm Select Folder.';
  return 'Trong hộp thoại chọn thư mục, nhấn Ctrl+L, dán (Ctrl+V), Enter, rồi bấm Select.';
}

/** Mode 2: the one-time manual steps in the user's Chrome. Chrome forbids apps from doing these. */
export function ChromeGuide({ extensionPath, onDone, onAdopt }: Props) {
  const [message, setMessage] = useState<string | null>(null);

  async function copyAndSay(text: string, what: string) {
    setMessage((await copy(text)) ? `Đã chép ${what}.` : `Không chép được, hãy tự chọn và chép: ${text}`);
  }

  async function startChrome() {
    try {
      await openChrome();
      setMessage(null);
    } catch (e) {
      setMessage(errorMessage(String(e)));
    }
  }

  return (
    <section className="screen" aria-labelledby="guide-title">
      <h1 id="guide-title" className="screen__title">Nạp CAP vào Chrome</h1>
      <p className="screen__lead">Chrome không cho app nào tự cài tiện ích, nên bước này bạn làm một lần (khoảng 30 giây).</p>
      <div className="notice notice--accent">
        <h2 className="steps__title">Chrome đã có CAP rồi?</h2>
        <p className="screen__lead">
          Không cần gỡ hay nạp lại. Mở <code>chrome://extensions</code>, bấm <strong>Details</strong> (Chi tiết) ở thẻ Connecttech Auto Poster,
          xem dòng <strong>Loaded from</strong> (Tải từ), rồi chọn đúng thư mục đó. App sẽ cập nhật thẳng vào thư mục ấy; dữ liệu giữ nguyên và CAP tự tải lại khi không có lượt chạy nào.
        </p>
        <div className="steps__actions">
          <button className="button button--primary" type="button" onClick={onAdopt}>Chọn thư mục CAP đang dùng</button>
        </div>
      </div>
      <h2 className="screen__subtitle">Hoặc nạp CAP mới vào Chrome</h2>
      <ol className="steps">
        <li className="steps__item">
          <h2 className="steps__title">Mở trang tiện ích của Chrome</h2>
          <p>Mở Chrome, bấm vào thanh địa chỉ, dán địa chỉ dưới đây rồi nhấn Enter.</p>
          <div className="steps__actions">
            <button className="button" type="button" onClick={() => void startChrome()}>Mở Chrome</button>
            <button className="button" type="button" onClick={() => void copyAndSay('chrome://extensions', 'địa chỉ chrome://extensions')}>
              Chép địa chỉ chrome://extensions
            </button>
          </div>
        </li>
        <li className="steps__item">
          <h2 className="steps__title">Bật Developer mode</h2>
          <p>Ở góc trên bên phải trang tiện ích, bật công tắc <strong>Developer mode</strong> (Chế độ nhà phát triển).</p>
        </li>
        <li className="steps__item">
          <h2 className="steps__title">Nạp thư mục CAP</h2>
          <p>
            Nếu đang có CAP cũ, hãy xuất bản sao lưu rồi gỡ nó trước. Bấm <strong>Load unpacked</strong> (Tải tiện ích đã giải nén).{' '}
            {pasteHint()}
          </p>
          <code className="steps__path">{extensionPath}</code>
          <div className="steps__actions">
            <button className="button" type="button" onClick={() => void copyAndSay(extensionPath, 'đường dẫn thư mục')}>
              Chép đường dẫn thư mục
            </button>
          </div>
        </li>
      </ol>
      {message && <p className="notice" role="status">{message}</p>}
      <button className="button button--primary" type="button" onClick={onDone}>Tôi đã làm xong</button>
    </section>
  );
}
