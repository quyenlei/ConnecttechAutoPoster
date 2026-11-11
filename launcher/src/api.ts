import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';

export type Mode = 'browser' | 'chrome';

/** Mirrors `Status` in src-tauri/src/commands.rs. */
export interface Status {
  mode: Mode | null;
  platformSupported: boolean;
  capVersion: string | null;
  browserVersion: string | null;
  browserRunning: boolean;
  /** CAP version waiting for the browser to close; "" when only the browser itself waits. */
  pendingUpdate: string | null;
  extensionPath: string;
  latest: string | null;
  appVersion: string;
  appUpdate: boolean;
  /** Release page of the newest app version (`app.pageUrl` in update.json). */
  appPageUrl: string | null;
  busy: boolean;
  error: string | null;
}

export interface Progress {
  item: 'cap' | 'browser';
  done: number;
  total: number | null;
}

/** All releases; the app's own are tagged app-v<version> (CAP's v<version>). */
export const RELEASES_URL = 'https://github.com/quyenlei/ConnecttechAutoPoster/releases';

export const getStatus = () => invoke<Status>('get_status');
export const setMode = (mode: Mode) => invoke<Status>('set_mode', { mode });
export const checkUpdates = () => invoke<void>('check_updates');
export const launchBrowser = () => invoke<void>('launch_browser');
export const openChrome = () => invoke<void>('open_chrome');
/** Keep the CAP folder Chrome already loads up to date (mode Chrome có sẵn). Fails with "not-cap" for other folders. */
export const useCapFolder = (path: string) => invoke<Status>('use_cap_folder', { path });
/** Asks the user for a folder; null when cancelled. */
export async function pickFolder(title: string): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false, title });
  return typeof picked === 'string' ? picked : null;
}
export const openDataFolder = () => invoke<void>('open_data_folder');
export const readLog = () => invoke<string>('read_log');

export const onStatus = (handler: (status: Status) => void): Promise<UnlistenFn> =>
  listen<Status>('status', (event) => handler(event.payload));
export const onProgress = (handler: (progress: Progress) => void): Promise<UnlistenFn> =>
  listen<Progress>('progress', (event) => handler(event.payload));

/** Error codes from src-tauri/src/release.rs (ErrorCode::as_str). */
const MESSAGES: Record<string, string> = {
  network: 'Không tải được từ Internet. Kiểm tra mạng rồi thử lại.',
  manifest: 'Thông tin bản phát hành không hợp lệ, nên chưa cài.',
  'checksum-missing': 'Bản phát hành chưa có mã kiểm tra, nên chưa cài.',
  checksum: 'File tải về không khớp mã kiểm tra, nên chưa cài. Hãy thử lại sau.',
  archive: 'File tải về bị lỗi, nên chưa cài.',
  folder: 'Không ghi được vào thư mục của app. Hãy đóng trình duyệt của app rồi thử lại.',
  'not-cap': 'Thư mục này không phải thư mục CAP (không có manifest.json của Connecttech Auto Poster). Hãy chọn đúng thư mục ghi ở mục "Loaded from" của CAP trong chrome://extensions.',
  'chrome-missing': 'Không mở được Google Chrome. Hãy mở Chrome bằng tay.',
  busy: 'App đang làm việc khác, chờ một chút rồi thử lại.',
};

export function errorMessage(code: string): string {
  return MESSAGES[code] ?? 'Có lỗi xảy ra. Hãy thử lại.';
}

/** Copies text; true on success. */
export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
