import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { isActive } from '@/lib/run-engine';
import { runItem, updateItem, updaterItem } from '@/lib/storage';
import { isNewer, UPDATE_PAGE_URL } from '@/lib/update';
import { runsFromOtherFolder, UPDATER_DOWNLOADS, updaterOs } from '@/lib/updater';
import { useConfirm } from './confirm';
import { sendCommand, useItem } from './hooks';

const OS_NAMES = { win: 'Windows', mac: 'macOS', linux: 'Linux' } as const;
/** How to start the installer once it is unzipped. */
const INSTALLER_STEPS = {
  win: <>bấm đúp <code>install.bat</code></>,
  mac: <>bấm đúp <code>install.command</code></>,
  linux: <>mở Terminal trong thư mục đó và chạy <code>bash install.sh</code></>,
} as const;

/**
 * Shows when a newer version is on GitHub. With the updater helper installed (lib/updater.ts) it offers
 * "Cập nhật ngay"; otherwise the zip download, the manual steps and the helper's installer.
 * `withCheck` adds a "check now" button and the last check result (dashboard only).
 */
export function UpdateNotice({ withCheck = false, compact = false }: { withCheck?: boolean; compact?: boolean }) {
  const update = useItem(updateItem);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const current = browser.runtime.getManifest().version;
  const latest = update?.latest && isNewer(update.latest.version, current) ? update.latest : null;
  const updater = useItem(updaterItem);
  const run = useItem(runItem);
  const confirm = useConfirm();
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const os = updaterOs(navigator.userAgent);
  const otherFolder = runsFromOtherFolder(updater ?? null, current);
  const helperReady = Boolean(updater?.installed) && !otherFolder;
  const running = run ? isActive(run) : false;

  // Ask the helper (if any) only when there is something to install.
  const latestVersion = latest?.version ?? null;
  useEffect(() => {
    if (latestVersion) void sendCommand({ type: 'cap/run/updater-status' });
  }, [latestVersion]);

  async function install(version: string) {
    const ok = await confirm(
      `Cập nhật CAP lên ${version}? Trình cập nhật sẽ tải bản mới từ GitHub, kiểm tra rồi CAP tự tải lại. Sau đó hãy tải lại các tab Facebook.`,
      { okLabel: 'Cập nhật' },
    );
    if (!ok) return;
    setInstalling(true);
    setInstallMessage(null);
    const reply = await sendCommand({ type: 'cap/run/install-update' });
    setInstalling(false);
    setInstallMessage(reply.ok ? 'Đã cập nhật. CAP đang tải lại…' : (reply.error ?? 'Không cập nhật được.'));
  }

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
            {helperReady ? (
              <button className="button button--small button--primary" type="button" onClick={() => void install(latest.version)} disabled={installing || running}>
                {installing ? 'Đang cập nhật…' : 'Cập nhật ngay'}
              </button>
            ) : (
              <a className="button button--small button--primary" href={latest.zipUrl ?? latest.pageUrl} target="_blank" rel="noreferrer">
                {latest.zipUrl ? `Tải bản ${latest.version}` : 'Mở trang tải về'}
              </a>
            )}
            <a className="button button--small" href={latest.pageUrl} target="_blank" rel="noreferrer">Xem thay đổi</a>
          </div>
          {helperReady && running && <p className="update__hint">Hãy dừng lượt chạy trước khi cập nhật.</p>}
          {installMessage && <p className="update__hint">{installMessage}</p>}
          {otherFolder && (
            <p className="update__hint">
              Trình cập nhật đã cài, nhưng CAP đang chạy từ một thư mục khác. Hãy xuất bản sao lưu, gỡ bản này trong <code>chrome://extensions</code>, rồi Load unpacked thư mục <code>{updater?.folder}</code> và nhập lại dữ liệu.
            </p>
          )}
          {!helperReady && (
            <p className="update__hint">
              Cách cập nhật: giải nén file zip đè lên thư mục extension đang dùng, mở <code>chrome://extensions</code>, bấm tải lại Connecttech Auto Poster, rồi tải lại các tab Facebook.
            </p>
          )}
          {!updater?.installed && os && (
            <p className="update__hint">
              Muốn lần sau chỉ cần bấm một nút? <a href={UPDATER_DOWNLOADS[os]} target="_blank" rel="noreferrer">Tải bộ cài trình cập nhật cho {OS_NAMES[os]}</a>, giải nén rồi {INSTALLER_STEPS[os]}. Cài một lần là đủ.
            </p>
          )}
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
