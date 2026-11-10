/**
 * Update check against the GitHub releases of a public repository that holds only the built extension.
 * The source repository stays private. Chrome cannot replace an unpacked extension's own files, so CAP only
 * tells the user that a newer version exists and links to its zip; installing stays a manual step.
 */

/** Public repository with one release per version (tag `v1.2.3`, the built zip attached). */
export const UPDATE_REPO = 'quyenlei/ConnecttechAutoPoster-releases';
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
