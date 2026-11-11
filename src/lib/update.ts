/**
 * Update check against the GitHub releases of the public CAP repository (built zip attached to each release).
 * Chrome cannot replace an unpacked extension's own files, so CAP only
 * tells the user that a newer version exists and links to its zip; installing stays a manual step.
 *
 * First choice is `update.json`, a static file the release workflow writes to the `update` branch after the
 * release and its zip exist. GitHub serves it from its CDN without the API's limit of 60 requests an hour per IP,
 * which many people behind one Wi-Fi share. Only when that file cannot be read is the release API asked.
 */

/** Public CAP repository with one release per version (tag `v1.2.3`, the built zip attached). */
export const UPDATE_REPO = 'quyenlei/ConnecttechAutoPoster';
/** Branch that holds only `update.json`; written by `scripts/release.mjs`, never edited by hand. */
export const UPDATE_BRANCH = 'update';
export const UPDATE_MANIFEST_URL = `https://raw.githubusercontent.com/${UPDATE_REPO}/${UPDATE_BRANCH}/update.json`;
export const UPDATE_API_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
export const UPDATE_PAGE_URL = `https://github.com/${UPDATE_REPO}/releases/latest`;

/** Automatic checks run at most this often. */
export const UPDATE_CHECK_EVERY_MS = 24 * 3_600_000;

export interface LatestRelease {
  version: string;
  /** The release page on GitHub. */
  pageUrl: string;
  /** Direct download of the attached extension zip, when the release has one. */
  zipUrl: string | null;
  publishedAt: string | null;
}

/** What the last check found. Kept locally; only versions and GitHub links, nothing about the user. */
export interface UpdateState {
  checkedAt: number;
  latest: LatestRelease | null;
  error: string | null;
}

/** "v1.2.3" or "1.2.3" to [1, 2, 3]; null for anything else. */
export function parseVersion(text: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** True only when both versions parse and `latest` is strictly newer. */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const githubUrl = (v: unknown): string | null =>
  typeof v === 'string' && /^https:\/\/github\.com\//.test(v) ? v : null;

/**
 * Reads GitHub's "latest release" answer. Untrusted input: only a version tag and links on github.com are kept,
 * so the UI never links anywhere else. Drafts and pre-releases are ignored.
 */
export function parseLatestRelease(body: unknown): LatestRelease | null {
  if (!isRecord(body) || body.draft === true || body.prerelease === true) return null;
  const tag = typeof body.tag_name === 'string' ? body.tag_name : '';
  const parsed = parseVersion(tag);
  const pageUrl = githubUrl(body.html_url);
  if (!parsed || !pageUrl) return null;
  const assets = Array.isArray(body.assets) ? body.assets.filter(isRecord) : [];
  const zip = assets.find((a) => typeof a.name === 'string' && a.name.toLowerCase().endsWith('.zip'));
  return {
    version: parsed.join('.'),
    pageUrl,
    zipUrl: zip ? githubUrl(zip.browser_download_url) : null,
    publishedAt: typeof body.published_at === 'string' ? body.published_at : null,
  };
}

/** Whether an automatic check is due: never checked, or the last one is older than a day (or in the future). */
export function updateCheckDue(state: UpdateState | null, now: number): boolean {
  if (!state) return true;
  return now - state.checkedAt >= UPDATE_CHECK_EVERY_MS || state.checkedAt > now;
}

/**
 * Reads `update.json` (fields as in `LatestRelease`). Untrusted input like the API answer: only a version and
 * links on github.com are kept.
 */
export function parseUpdateManifest(body: unknown): LatestRelease | null {
  if (!isRecord(body)) return null;
  const parsed = typeof body.version === 'string' ? parseVersion(body.version) : null;
  const pageUrl = githubUrl(body.pageUrl);
  if (!parsed || !pageUrl) return null;
  return {
    version: parsed.join('.'),
    pageUrl,
    zipUrl: githubUrl(body.zipUrl),
    publishedAt: typeof body.publishedAt === 'string' ? body.publishedAt : null,
  };
}

/** "08:05" for a Unix time in seconds, in the user's time zone. */
const clock = (seconds: number): string => {
  const d = new Date(seconds * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * What to tell the user when the release API answers with an error. A 403 with no requests left (or a 429) is
 * GitHub's per-IP limit, shared by everyone on the same network; `reset` is GitHub's `X-RateLimit-Reset`.
 */
export function apiErrorMessage(status: number, remaining: string | null, reset: string | null): string {
  if (status === 404) return 'Chưa có bản phát hành nào.';
  if (status === 429 || (status === 403 && remaining === '0')) {
    const at = reset !== null && /^\d+$/.test(reset) ? clock(Number(reset)) : null;
    return `GitHub đang giới hạn lượt kiểm tra từ mạng của bạn, thử lại sau ${at ?? 'ít phút'}.`;
  }
  return `GitHub trả về lỗi ${status}.`;
}

/** The parts of `fetch` the check uses, so tests can stand in for GitHub. */
export type UpdateFetch = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; json(): Promise<unknown> }>;

const REQUEST: RequestInit = { credentials: 'omit', cache: 'no-store' };

/**
 * Finds the latest release: `update.json` first, the release API only when that file is missing, unreadable
 * or invalid. Throws an Error with a message for the user when neither works; a network failure of the API
 * request is rethrown as is (a TypeError).
 */
export async function fetchLatestRelease(get: UpdateFetch): Promise<LatestRelease> {
  try {
    const response = await get(UPDATE_MANIFEST_URL, REQUEST);
    if (response.ok) {
      const latest = parseUpdateManifest(await response.json());
      if (latest) return latest;
    }
  } catch {
    // Fall through to the API.
  }
  const response = await get(UPDATE_API_URL, { ...REQUEST, headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) {
    throw new Error(apiErrorMessage(response.status, response.headers.get('x-ratelimit-remaining'), response.headers.get('x-ratelimit-reset')));
  }
  const latest = parseLatestRelease(await response.json());
  if (!latest) throw new Error('Không đọc được bản phát hành mới nhất.');
  return latest;
}
