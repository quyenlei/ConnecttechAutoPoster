import { describe, expect, it } from 'vitest';
import { DEFAULT_CAMPAIGN_IDS, DEFAULT_COMMENT_TEXTS, defaultCampaigns, fillDefaultComments, withDefaultCampaigns } from '../src/lib/defaults';
import { hasUnknownPlaceholder } from '../src/lib/template';
import { LIMITS } from '../src/lib/limits';
import type { Group } from '../src/lib/types';

const group = (id: string): Group => ({ id, name: id, url: `https://www.facebook.com/groups/${id}/` });
const NOW = 1_000;

describe('default campaigns', () => {
  it('creates a fast comment campaign and a post campaign on every saved group', () => {
    const [comment, post] = defaultCampaigns([group('a'), group('b')], NOW);
    expect(comment).toMatchObject({ id: DEFAULT_CAMPAIGN_IDS.comment, mode: 'comment', commentsPerGroup: 25, groupIds: ['a', 'b'], delay: { minSec: 2, maxSec: 4 }, groupBreak: { minSec: 10, maxSec: 20 } });
    expect(comment?.safetyBreak.enabled).toBe(false);
    expect(post).toMatchObject({ id: DEFAULT_CAMPAIGN_IDS.post, mode: 'post', groupIds: ['a', 'b'] });
    expect(post?.delay.minSec).toBeGreaterThanOrEqual(LIMITS.minDelaySec);
    expect(post?.safetyBreak.enabled).toBe(true);
  });

  it('fills the comment campaign with the Connecttech comments and leaves the post text empty', () => {
    const [comment, post] = defaultCampaigns([group('a')], NOW);
    expect(comment?.variations).toEqual([...DEFAULT_COMMENT_TEXTS]);
    expect(post?.variations).toEqual(['']);
  });

  it('keeps the default comments within the campaign limits and free of unknown placeholders', () => {
    expect(DEFAULT_COMMENT_TEXTS.length).toBeGreaterThan(0);
    expect(DEFAULT_COMMENT_TEXTS.length).toBeLessThanOrEqual(LIMITS.maxVariations);
    for (const text of DEFAULT_COMMENT_TEXTS) {
      expect(text.trim()).toBe(text);
      expect(text).toContain('Connecttech');
      expect(text.length).toBeLessThanOrEqual(LIMITS.maxPostLength);
      expect(hasUnknownPlaceholder(text)).toBe(false);
      expect(text).not.toMatch(/\[[^\]]*\]/);
    }
  });

  it('keeps to the group limit per campaign', () => {
    const many = Array.from({ length: LIMITS.maxGroupsPerCampaign + 5 }, (_, i) => group(`g${i}`));
    expect(defaultCampaigns(many, NOW)[0]?.groupIds).toHaveLength(LIMITS.maxGroupsPerCampaign);
  });

  it('fills the sample comments into an existing default comment campaign whose text is still empty', () => {
    const [comment, post] = defaultCampaigns([group('a')], NOW).map((c) => ({ ...c, variations: ['', '  '] }));
    const result = fillDefaultComments([comment!, post!]);
    expect(result.filled).toBe(true);
    expect(result.campaigns[0]).toEqual({ ...comment, variations: [...DEFAULT_COMMENT_TEXTS] });
    expect(result.campaigns[1]).toBe(post);
  });

  it('never replaces comments the user wrote, nor touches other campaigns', () => {
    const [comment] = defaultCampaigns([group('a')], NOW);
    const written = { ...comment!, variations: ['', 'Của tôi'] };
    const other = { ...comment!, id: 'mine', variations: [''] };
    const result = fillDefaultComments([written, other]);
    expect(result.filled).toBe(false);
    expect(result.campaigns).toEqual([written, other]);
  });

  it('fills an empty default comment campaign when the defaults are added again', () => {
    const [comment] = defaultCampaigns([group('a')], NOW);
    const result = withDefaultCampaigns([{ ...comment!, variations: [''] }], [group('a')], NOW);
    expect(result.added).toBe(1);
    expect(result.filled).toBe(true);
    expect(result.campaigns.find((c) => c.id === DEFAULT_CAMPAIGN_IDS.comment)?.variations).toEqual([...DEFAULT_COMMENT_TEXTS]);
  });

  it('adds only the defaults that are missing and keeps existing campaigns as they are', () => {
    const first = withDefaultCampaigns([], [group('a')], NOW);
    expect(first.added).toBe(2);
    const edited = first.campaigns.map((c) => (c.id === DEFAULT_CAMPAIGN_IDS.comment ? { ...c, variations: ['Hay quá'] } : c));
    const again = withDefaultCampaigns(edited.filter((c) => c.id !== DEFAULT_CAMPAIGN_IDS.post), [group('a')], NOW);
    expect(again.added).toBe(1);
    expect(again.campaigns.find((c) => c.id === DEFAULT_CAMPAIGN_IDS.comment)?.variations).toEqual(['Hay quá']);
  });
});
