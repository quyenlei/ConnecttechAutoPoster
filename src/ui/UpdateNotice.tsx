import { useState } from 'react';
import { browser } from 'wxt/browser';
import { updateItem } from '@/lib/storage';
import { isNewer, UPDATE_PAGE_URL } from '@/lib/update';
import { sendCommand, useItem } from './hooks';

/**
 * Shows when a newer version is on GitHub: the zip download, the change log, and how to update (the Connecttech
 * app, or the manual steps). `withCheck` adds a "check now" button and the last check result (dashboard only).
 */
export function UpdateNotice({ withCheck = false, compact = false }: { withCheck?: boolean; compact?: boolean }) {
  const update = useItem(updateItem);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const current = browser.runtime.getManifest().version;
  const latest = update?.latest && isNewer(update.latest.version, current) ? update.latest : null;

  async function check() {
    setChecking(true);
    const reply = await sendCommand({ type: 'cap/run/check-update' });
    setChecking(false);
    setMessage(reply.ok ? null : (reply.error ?? 'Không kiểm tra được.'));
  }

  if (!latest && !withCheck) return null;

  return (
    <section className={compact ? 'update update--compact' : 'update'} aria-label="Cập nhật">
      {latest ? (
        <>
          <p className="update__title">
            Có bản mới <strong>{latest.version}</strong> (bạn đang dùng {current}).
          </p>
          <div className="update__actions">
            <a className="button button--small button--primary" href={latest.zipUrl ?? latest.pageUrl} target="_blank" rel="noreferrer">
              {latest.zipUrl ? `Tải bản ${latest.version}` : 'Mở trang tải về'}
            </a>
            <a className="button button--small" href={latest.pageUrl} target="_blank" rel="noreferrer">Xem thay đổi</a>
          </div>
          <p className="update__hint">
            Dùng app Connecttech: mở app rồi bấm <strong>Kiểm tra cập nhật</strong>. CAP tự tải lại khi không có lượt chạy nào.
          </p>
          <p className="update__hint">
            Cài thủ công: giải nén file zip đè lên thư mục extension đang dùng, mở <code>chrome://extensions</code>, bấm tải lại Connecttech Auto Poster, rồi tải lại các tab Facebook.
          </p>
        </>
      ) : (
        <p className="update__title">
          Phiên bản {current}{update?.checkedAt ? (update.error ? '' : ' là bản mới nhất.') : '.'}
        </p>
      )}
      {withCheck && (
        <div className="update__actions">
          <button className="button button--small" type="button" onClick={() => void check()} disabled={checking}>
            {checking ? 'Đang kiểm tra…' : 'Kiểm tra cập nhật'}
          </button>
          {update?.checkedAt ? <span className="u-muted">Lần kiểm tra gần nhất: {new Date(update.checkedAt).toLocaleString('vi-VN')}</span> : null}
        </div>
      )}
      {withCheck && (message ?? update?.error) && <p className="update__hint">{message ?? update?.error}</p>}
      {withCheck && <p className="update__hint">Bản phát hành lấy từ <a href={UPDATE_PAGE_URL} target="_blank" rel="noreferrer">trang GitHub của CAP</a>.</p>}
    </section>
  );
}
