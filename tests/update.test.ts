import { describe, expect, it } from 'vitest';
import {
  apiErrorMessage,
  fetchLatestRelease,
  isNewer,
  parseLatestRelease,
  parseUpdateManifest,
  parseVersion,
  updateCheckDue,
  UPDATE_API_URL,
  UPDATE_CHECK_EVERY_MS,
  UPDATE_MANIFEST_URL,
  type UpdateFetch,
} from '../src/lib/update';

const release = (over: Record<string, unknown> = {}) => ({
  tag_name: 'v0.7.0',
  html_url: 'https://github.com/quyenlei/ConnecttechAutoPoster/releases/tag/v0.7.0',
  published_at: '2026-11-11T02:00:00Z',
  draft: false,
  prerelease: false,
  assets: [
    { name: 'notes.txt', browser_download_url: 'https://github.com/x/y/releases/download/v0.7.0/notes.txt' },
    { name: 'connecttech-auto-poster-0.7.0-chrome.zip', browser_download_url: 'https://github.com/x/y/releases/download/v0.7.0/cap.zip' },
  ],
  ...over,
});

describe('update check', () => {
  it('parses versions with or without a leading v', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('0.6.10')).toEqual([0, 6, 10]);
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('v1.2.3-beta')).toBeNull();
  });

  it('compares numerically and only reports a strictly newer version', () => {
    expect(isNewer('0.6.10', '0.6.9')).toBe(true);
    expect(isNewer('v0.7.0', '0.6.7')).toBe(true);
    expect(isNewer('0.6.7', '0.6.7')).toBe(false);
    expect(isNewer('0.6.6', '0.6.7')).toBe(false);
    expect(isNewer('nonsense', '0.6.7')).toBe(false);
  });

  it('reads the version, the release page and the zip download', () => {
    expect(parseLatestRelease(release())).toEqual({
      version: '0.7.0',
      pageUrl: 'https://github.com/quyenlei/ConnecttechAutoPoster/releases/tag/v0.7.0',
      zipUrl: 'https://github.com/x/y/releases/download/v0.7.0/cap.zip',
      publishedAt: '2026-11-11T02:00:00Z',
    });
    expect(parseLatestRelease(release({ assets: [] }))?.zipUrl).toBeNull();
  });

  it('ignores drafts, pre-releases, bad tags and links outside github.com', () => {
    expect(parseLatestRelease(release({ draft: true }))).toBeNull();
    expect(parseLatestRelease(release({ prerelease: true }))).toBeNull();
    expect(parseLatestRelease(release({ tag_name: 'latest' }))).toBeNull();
    expect(parseLatestRelease(release({ html_url: 'https://evil.example/x' }))).toBeNull();
    expect(parseLatestRelease(release({ assets: [{ name: 'a.zip', browser_download_url: 'https://evil.example/a.zip' }] }))?.zipUrl).toBeNull();
    expect(parseLatestRelease(null)).toBeNull();
    expect(parseLatestRelease('x')).toBeNull();
  });

  it('checks at most once a day', () => {
    const now = 10 * UPDATE_CHECK_EVERY_MS;
    expect(updateCheckDue(null, now)).toBe(true);
    expect(updateCheckDue({ checkedAt: now - 1000, latest: null, error: null }, now)).toBe(false);
    expect(updateCheckDue({ checkedAt: now - UPDATE_CHECK_EVERY_MS, latest: null, error: null }, now)).toBe(true);
    expect(updateCheckDue({ checkedAt: now + 60_000, latest: null, error: null }, now)).toBe(true);
  });

  it('reads update.json and keeps only github.com links', () => {
    const manifest = {
      version: 'v0.7.3',
      pageUrl: 'https://github.com/quyenlei/ConnecttechAutoPoster/releases/tag/v0.7.3',
      zipUrl: 'https://github.com/quyenlei/ConnecttechAutoPoster/releases/download/v0.7.3/cap.zip',
      publishedAt: '2026-11-11T05:00:00Z',
    };
    expect(parseUpdateManifest(manifest)).toEqual({ ...manifest, version: '0.7.3' });
    expect(parseUpdateManifest({ ...manifest, zipUrl: 'https://evil.example/a.zip' })?.zipUrl).toBeNull();
    expect(parseUpdateManifest({ ...manifest, pageUrl: 'https://evil.example/' })).toBeNull();
    expect(parseUpdateManifest({ ...manifest, version: 'latest' })).toBeNull();
    expect(parseUpdateManifest([])).toBeNull();
  });

  it('explains the per-IP limit with the time to try again', () => {
    const reset = String(Math.floor(new Date(2026, 10, 11, 11, 23).getTime() / 1000));
    expect(apiErrorMessage(403, '0', reset)).toBe('GitHub đang giới hạn lượt kiểm tra từ mạng của bạn, thử lại sau 11:23.');
    expect(apiErrorMessage(429, null, null)).toBe('GitHub đang giới hạn lượt kiểm tra từ mạng của bạn, thử lại sau ít phút.');
    expect(apiErrorMessage(403, '12', reset)).toBe('GitHub trả về lỗi 403.');
    expect(apiErrorMessage(404, null, null)).toBe('Chưa có bản phát hành nào.');
  });
});

describe('fetchLatestRelease', () => {
  type Answer = { status: number; body?: unknown; headers?: Record<string, string> } | 'network-error';
  const fake = (answers: Record<string, Answer>) => {
    const calls: string[] = [];
    const get: UpdateFetch = async (url, init) => {
      calls.push(url);
      expect(init.credentials).toBe('omit');
      const answer = answers[url] ?? { status: 404 };
      if (answer === 'network-error') throw new TypeError('Failed to fetch');
      return {
        ok: answer.status >= 200 && answer.status < 300,
        status: answer.status,
        headers: { get: (name: string) => answer.headers?.[name.toLowerCase()] ?? null },
        json: async () => answer.body,
      };
    };
    return { get, calls };
  };
  const manifest = { version: '0.7.3', pageUrl: 'https://github.com/quyenlei/ConnecttechAutoPoster/releases/tag/v0.7.3', zipUrl: null, publishedAt: null };

  it('uses update.json and does not touch the API when it is valid', async () => {
    const { get, calls } = fake({ [UPDATE_MANIFEST_URL]: { status: 200, body: manifest } });
    expect((await fetchLatestRelease(get)).version).toBe('0.7.3');
    expect(calls).toEqual([UPDATE_MANIFEST_URL]);
  });

  it('falls back to the API when update.json is missing, broken or unreachable', async () => {
    for (const answer of [{ status: 404 }, { status: 200, body: { version: 'x' } }, 'network-error'] as Answer[]) {
      const { get, calls } = fake({ [UPDATE_MANIFEST_URL]: answer, [UPDATE_API_URL]: { status: 200, body: release() } });
      expect((await fetchLatestRelease(get)).version).toBe('0.7.0');
      expect(calls).toEqual([UPDATE_MANIFEST_URL, UPDATE_API_URL]);
    }
  });

  it('reports the API limit when both fail', async () => {
    const { get } = fake({ [UPDATE_API_URL]: { status: 403, headers: { 'x-ratelimit-remaining': '0' } } });
    await expect(fetchLatestRelease(get)).rejects.toThrow('GitHub đang giới hạn lượt kiểm tra');
  });

  it('rethrows a network failure of the API as a TypeError', async () => {
    const { get } = fake({ [UPDATE_MANIFEST_URL]: 'network-error', [UPDATE_API_URL]: 'network-error' });
    await expect(fetchLatestRelease(get)).rejects.toBeInstanceOf(TypeError);
  });
});
