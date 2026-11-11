import { describe, expect, it } from 'vitest';
import { commentKeys, describeScan, emptyCounts, feedIsExhausted, feedKey, historyKeysForGroup, judgeFeedPost, type FeedCandidate } from '../src/lib/comment-pick';

const HOUR = 3_600_000;
const post = (extra: Partial<FeedCandidate> = {}): FeedCandidate => ({
  fingerprint: 'fp1',
  url: null,
  age: { minAgeMs: HOUR, maxAgeMs: 2 * HOUR },
  mine: false,
  canComment: true,
  ...extra,
});

describe('comment keys', () => {
  it('uses only the post link when known, and the fingerprint otherwise', () => {
    expect(commentKeys('g', { fingerprint: 'fp', url: 'https://www.facebook.com/groups/g/posts/1/' })).toEqual(['https://www.facebook.com/groups/g/posts/1/']);
    expect(commentKeys('g', { fingerprint: 'fp', url: null })).toEqual(['feed:g:fp']);
    expect(commentKeys('g', { fingerprint: 'fp', url: null, minute: 7 })).toEqual(['feed:g:fp@7']);
    expect(commentKeys('g', { fingerprint: null, url: null })).toEqual([]);
  });

  it('selects the history of one group only', () => {
    const history = {
      'https://www.facebook.com/groups/g/posts/1/': 1,
      'https://www.facebook.com/groups/other/posts/2/': 1,
      [feedKey('g', 'a')]: 1,
      [feedKey('other', 'b')]: 1,
      'slot:c:1:0': 1,
    };
    expect(historyKeysForGroup(history, 'g').sort()).toEqual(['feed:g:a', 'https://www.facebook.com/groups/g/posts/1/']);
  });
});

describe('judgeFeedPost', () => {
  const none = new Set<string>();

  it('accepts a recent post with a way to comment', () => {
    expect(judgeFeedPost(post(), 'recent', none, 'g')).toBeNull();
  });

  it('skips posts already tried by link or fingerprint', () => {
    expect(judgeFeedPost(post(), 'recent', new Set(['feed:g:fp1']), 'g')).toBe('tried');
    const url = 'https://www.facebook.com/groups/g/posts/1/';
    expect(judgeFeedPost(post({ fingerprint: 'new', url }), 'recent', new Set([url]), 'g')).toBe('tried');
  });

  it('does not mistake a repost with the same author and text for a tried post once its link is known', () => {
    const repost = post({ url: 'https://www.facebook.com/groups/g/posts/2/' });
    expect(judgeFeedPost(repost, 'recent', new Set(['feed:g:fp1', 'https://www.facebook.com/groups/g/posts/1/']), 'g')).toBeNull();
  });

  it('tells a repost without a link apart by the minute it was posted (seen live 2026-11-11)', () => {
    const tried = new Set([feedKey('g', 'fp1', 20)]);
    expect(judgeFeedPost(post({ minute: 21 }), 'recent', tried, 'g')).toBeNull();
    expect(judgeFeedPost(post({ minute: 20 }), 'recent', tried, 'g')).toBe('tried');
    // Keys stored before the minute was used do not block a post whose minute is known.
    expect(judgeFeedPost(post({ minute: 21 }), 'recent', new Set([feedKey('g', 'fp1')]), 'g')).toBeNull();
  });

  it('treats any key of the same post as tried when its minute cannot be read', () => {
    expect(judgeFeedPost(post({ minute: null }), 'recent', new Set([feedKey('g', 'fp1', 20)]), 'g')).toBe('tried');
    expect(judgeFeedPost(post({ minute: null }), 'recent', new Set([feedKey('g', 'fp1')]), 'g')).toBe('tried');
    expect(judgeFeedPost(post({ minute: null }), 'recent', new Set([feedKey('g', 'fp10', 20)]), 'g')).toBeNull();
  });

  it('skips posts the user already commented on', () => {
    expect(judgeFeedPost(post({ mine: true }), 'newest', none, 'g')).toBe('mine');
  });

  it('skips posts known to be older than 24 hours in both modes', () => {
    const old = post({ age: { minAgeMs: 24 * HOUR, maxAgeMs: 48 * HOUR } });
    expect(judgeFeedPost(old, 'recent', none, 'g')).toBe('old');
    expect(judgeFeedPost(old, 'newest', none, 'g')).toBe('old');
  });

  it('needs a known age within 24 hours only in recent mode', () => {
    expect(judgeFeedPost(post({ age: null }), 'recent', none, 'g')).toBe('age-unknown');
    expect(judgeFeedPost(post({ age: { minAgeMs: 23 * HOUR, maxAgeMs: 25 * HOUR } }), 'recent', none, 'g')).toBe('age-unknown');
    expect(judgeFeedPost(post({ age: { minAgeMs: 23 * HOUR, maxAgeMs: 24 * HOUR } }), 'recent', none, 'g')).toBeNull();
    expect(judgeFeedPost(post({ age: null }), 'newest', none, 'g')).toBeNull();
  });

  it('skips posts that cannot be identified or commented', () => {
    expect(judgeFeedPost(post({ fingerprint: null }), 'newest', none, 'g')).toBe('unidentified');
    expect(judgeFeedPost(post({ canComment: false }), 'recent', none, 'g')).toBe('no-editor');
  });
});

describe('scan', () => {
  it('stops after three old posts in a row, not after one pinned old post', () => {
    expect(feedIsExhausted(['old', null, 'old'])).toBe(false);
    expect(feedIsExhausted(['old'])).toBe(false);
    expect(feedIsExhausted(['tried', 'old', 'old', 'old'])).toBe(true);
  });

  it('explains why nothing was chosen', () => {
    const counts = { ...emptyCounts(), tried: 2, old: 1 };
    expect(describeScan(counts, 3)).toBe('Không có bài phù hợp để bình luận. Đã xem 3 bài: 2 đã thử trước đó, 1 cũ hơn 24 giờ.');
    expect(describeScan(emptyCounts(), 0)).toBe('Không có bài phù hợp để bình luận. Đã xem 0 bài.');
  });
});
