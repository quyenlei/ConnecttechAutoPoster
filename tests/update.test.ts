import { describe, expect, it } from 'vitest';
import { isNewer, parseLatestRelease, parseVersion, updateCheckDue, UPDATE_CHECK_EVERY_MS } from '../src/lib/update';

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
});
