import type { PostAge } from './fb-dom';

const DAY_MS = 86_400_000;

/**
 * `recent`: only posts whose time is known to be within 24 hours.
 * `newest`: the first posts of the feed sorted by new posts; a post without a readable time is accepted.
 */
export type FeedMode = 'recent' | 'newest';

export type SkipReason = 'unidentified' | 'tried' | 'mine' | 'old' | 'age-unknown' | 'no-editor';

/** What the decision needs about one feed post. No DOM, so it can be unit tested. */
export interface FeedCandidate {
  fingerprint: string | null;
  url: string | null;
  age: PostAge | null;
  mine: boolean;
  /** The post shows a comment editor, or a "Bình luận" button that opens one. */
  canComment: boolean;
  /**
   * Minute of the hour the post was made (0-59), from its full date. Tells reposts with the same text apart when
   * there is no link. Only the minute: Facebook sometimes renders the date in another time zone (whole hours).
   */
  minute?: number | null;
}

export const feedKey = (groupId: string, fingerprint: string, minute?: number | null): string =>
  `feed:${groupId}:${fingerprint}${minute === undefined || minute === null ? '' : `@${minute}`}`;

/**
 * Keys stored in `commentedPosts` for a post: its link when known, otherwise its fingerprint with the minute it
 * was posted. The fingerprint is only author + text, so a repost with the same text shares it.
 */
export function commentKeys(groupId: string, c: Pick<FeedCandidate, 'fingerprint' | 'url' | 'minute'>): string[] {
  if (c.url) return [c.url];
  return c.fingerprint ? [feedKey(groupId, c.fingerprint, c.minute)] : [];
}

/** Without a link or a minute the post cannot be told apart from a repost, so any key of its fingerprint counts. */
function triedByFingerprint(c: FeedCandidate, tried: ReadonlySet<string>, groupId: string): boolean {
  if (c.url || !c.fingerprint || (c.minute !== undefined && c.minute !== null)) return false;
  const base = feedKey(groupId, c.fingerprint);
  for (const key of tried) if (key === base || key.startsWith(`${base}@`)) return true;
  return false;
}

/** History keys that belong to one group: its post links and its feed fingerprints. */
export function historyKeysForGroup(history: Record<string, number>, groupId: string): string[] {
  const link = `https://www.facebook.com/groups/${groupId}/posts/`;
  const feed = `feed:${groupId}:`;
  return Object.keys(history).filter((key) => key.startsWith(link) || key.startsWith(feed));
}

/** Null when the post can be commented; otherwise why it is skipped. Every check errs on the side of skipping. */
export function judgeFeedPost(c: FeedCandidate, mode: FeedMode, tried: ReadonlySet<string>, groupId: string): SkipReason | null {
  const keys = commentKeys(groupId, c);
  if (keys.length === 0) return 'unidentified';
  if (keys.some((key) => tried.has(key)) || triedByFingerprint(c, tried, groupId)) return 'tried';
  if (c.mine) return 'mine';
  if (c.age && c.age.minAgeMs >= DAY_MS) return 'old';
  if (mode === 'recent' && (!c.age || c.age.maxAgeMs > DAY_MS)) return 'age-unknown';
  if (!c.canComment) return 'no-editor';
  return null;
}

/**
 * Feed sorted by new posts: once a few posts in a row are known to be older than 24 hours, everything
 * below is older too, so scrolling further is pointless. Pinned posts at the top are why one is not enough.
 */
export function feedIsExhausted(recentReasons: readonly (SkipReason | null)[], oldInARow = 3): boolean {
  if (recentReasons.length < oldInARow) return false;
  return recentReasons.slice(-oldInARow).every((reason) => reason === 'old');
}

export type ScanCounts = Record<SkipReason, number>;

export const emptyCounts = (): ScanCounts => ({ unidentified: 0, tried: 0, mine: 0, old: 0, 'age-unknown': 0, 'no-editor': 0 });

const REASON_TEXT: Record<SkipReason, string> = {
  tried: 'đã thử trước đó',
  mine: 'bạn đã bình luận',
  old: 'cũ hơn 24 giờ',
  'age-unknown': 'không rõ giờ đăng',
  'no-editor': 'không có ô bình luận',
  unidentified: 'không nhận diện được',
};

/** Log line when no post can be used: how many were looked at and why each was skipped. */
export function describeScan(counts: ScanCounts, seen: number): string {
  const parts = (Object.keys(REASON_TEXT) as SkipReason[]).filter((r) => counts[r] > 0).map((r) => `${counts[r]} ${REASON_TEXT[r]}`);
  return `Không có bài phù hợp để bình luận. Đã xem ${seen} bài${parts.length ? `: ${parts.join(', ')}` : ''}.`;
}
