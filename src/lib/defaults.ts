import { recommendDelay } from './delay';
import { DEFAULT_COMMENT_DELAY, DEFAULT_GROUP_BREAK, DEFAULT_SAFETY_BREAK, LIMITS } from './limits';
import type { Campaign, Group } from './types';

/** Fixed ids, so the defaults are recognised and never added twice. */
export const DEFAULT_CAMPAIGN_IDS = { comment: 'default-comment', post: 'default-post' } as const;

/** Comments per group in the default comment campaign: what the owner comments by hand in one sitting. */
export const DEFAULT_COMMENTS_PER_GROUP = 25;

/**
 * The two ready-made campaigns: fast comments and a regular post, on every saved group (up to the campaign
 * limit). The text is left empty on purpose: a run refuses to start until the user writes it.
 */
export function defaultCampaigns(groups: readonly Group[], now: number): Campaign[] {
  const groupIds = groups.slice(0, LIMITS.maxGroupsPerCampaign).map((g) => g.id);
  return [
    {
      id: DEFAULT_CAMPAIGN_IDS.comment,
      name: 'Bình luận nhanh',
      mode: 'comment',
      commentsPerGroup: DEFAULT_COMMENTS_PER_GROUP,
      variations: [''],
      groupIds,
      delay: { ...DEFAULT_COMMENT_DELAY },
      groupBreak: { ...DEFAULT_GROUP_BREAK },
      safetyBreak: { ...DEFAULT_SAFETY_BREAK, enabled: false },
      createdAt: now,
    },
    {
      id: DEFAULT_CAMPAIGN_IDS.post,
      name: 'Đăng bài vào nhóm',
      mode: 'post',
      variations: [''],
      groupIds,
      delay: recommendDelay(groupIds.length || 10),
      safetyBreak: { ...DEFAULT_SAFETY_BREAK },
      createdAt: now + 1,
    },
  ];
}

/** Adds the default campaigns that are not in the list yet; campaigns already there are left untouched. */
export function withDefaultCampaigns(campaigns: readonly Campaign[], groups: readonly Group[], now: number): { campaigns: Campaign[]; added: number } {
  const missing = defaultCampaigns(groups, now).filter((d) => !campaigns.some((c) => c.id === d.id));
  return { campaigns: [...campaigns, ...missing], added: missing.length };
}
