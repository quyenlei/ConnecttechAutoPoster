import { describe, expect, it } from 'vitest';
import { DEFAULT_CAMPAIGN_IDS, defaultCampaigns, withDefaultCampaigns } from '../src/lib/defaults';
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

  it('leaves the text empty so nothing can run before the user writes it', () => {
    for (const c of defaultCampaigns([group('a')], NOW)) expect(c.variations).toEqual(['']);
  });

  it('keeps to the group limit per campaign', () => {
    const many = Array.from({ length: LIMITS.maxGroupsPerCampaign + 5 }, (_, i) => group(`g${i}`));
    expect(defaultCampaigns(many, NOW)[0]?.groupIds).toHaveLength(LIMITS.maxGroupsPerCampaign);
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
