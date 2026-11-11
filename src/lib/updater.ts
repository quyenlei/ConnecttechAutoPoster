/**
 * One-click updates through the optional updater helper (updater/ in the repository). The user installs the helper
 * once; it registers with Chrome as a native messaging host allowed only for CAP's fixed extension ID, and owns the
 * folder CAP is loaded from. On "Cập nhật ngay" CAP asks it to update; the helper downloads the release zip named
 * in update.json from github.com, checks its SHA-256 and replaces the folder; CAP then reloads itself.
 * CAP never downloads or runs code itself: it only sends `ping` or `update` and reads the short answer.
 */
import { UPDATE_REPO, parseVersion } from './update';

export const UPDATER_HOST = 'com.connecttech.cap_updater';
/** Fixed by `key` in wxt.config.ts; the helper's installers allow only this ID. */
export const EXTENSION_ID = 'ebembjpemaickbaogincmeajpgeabcbh';
/** Installers attached to every release under fixed names, so "latest" always works. */
export const UPDATER_DOWNLOADS = {
  win: `https://github.com/${UPDATE_REPO}/releases/latest/download/cap-updater-windows.zip`,
  mac: `https://github.com/${UPDATE_REPO}/releases/latest/download/cap-updater-mac.zip`,
} as const;

export type UpdaterOs = keyof typeof UPDATER_DOWNLOADS;

/** What CAP last learned about the helper. Local only. */
export interface UpdaterState {
  checkedAt: number;
  /** The helper answered. */
  installed: boolean;
  /** Version in the helper's extension folder, when it has one. */
  version: string | null;
  /** The helper's extension folder, shown when CAP runs from another one. */
  folder: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const versionOf = (v: unknown): string | null => (typeof v === 'string' && parseVersion(v) ? v : null);

/** Reads the answer to `ping`; null when it is not the helper's. */
export function parsePingReply(reply: unknown): { version: string | null; folder: string | null } | null {
  if (!isRecord(reply) || reply.ok !== true || reply.helper !== 1) return null;
  return { version: versionOf(reply.version), folder: typeof reply.folder === 'string' && reply.folder ? reply.folder : null };
}

export type UpdateReply = { ok: true; version: string; changed: boolean } | { ok: false; code: string };

/** Reads the answer to `update`. Anything unexpected becomes the code "unknown". */
export function parseUpdateReply(reply: unknown): UpdateReply {
  if (isRecord(reply) && reply.ok === true) {
    const version = versionOf(reply.version);
    if (version && typeof reply.changed === 'boolean') return { ok: true, version, changed: reply.changed };
  }
  if (isRecord(reply) && reply.ok === false && typeof reply.code === 'string') return { ok: false, code: reply.code };
  return { ok: false, code: 'unknown' };
}

const MESSAGES: Record<string, string> = {
  network: 'Trình cập nhật không tải được bản mới từ GitHub. Kiểm tra mạng rồi thử lại.',
  manifest: 'Thông tin bản phát hành trên GitHub không hợp lệ, nên chưa cập nhật.',
  'checksum-missing': 'Bản phát hành chưa có mã kiểm tra, nên chưa cập nhật. Hãy tải bản mới thủ công.',
  checksum: 'File tải về không khớp mã kiểm tra, nên chưa cập nhật. Hãy thử lại sau.',
  archive: 'File tải về bị lỗi, nên chưa cập nhật.',
  folder: 'Trình cập nhật không ghi được vào thư mục CAP. Hãy chạy lại bộ cài trình cập nhật.',
};

export function updaterErrorMessage(code: string): string {
  return MESSAGES[code] ?? 'Trình cập nhật gặp lỗi, chưa cập nhật. Hãy chạy lại bộ cài trình cập nhật.';
}

/** Chrome's error when no helper is registered (or it is not allowed for this extension). */
export function isMissingHost(error: string): boolean {
  return /native messaging host not found|access to the specified native messaging host is forbidden/i.test(error);
}

/**
 * True when the helper's folder holds a different version than the one running: CAP was loaded from another
 * folder, so updating the helper's folder would not change what Chrome runs.
 */
export function runsFromOtherFolder(state: UpdaterState | null, running: string): boolean {
  return Boolean(state?.installed && state.version !== running);
}

/** Which installer to offer, from the user agent; null for systems the helper does not support. */
export function updaterOs(userAgent: string): UpdaterOs | null {
  if (/Windows/i.test(userAgent)) return 'win';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'mac';
  return null;
}
