import { recommendDelay } from './delay';
import { DEFAULT_COMMENT_DELAY, DEFAULT_GROUP_BREAK, DEFAULT_SAFETY_BREAK, LIMITS } from './limits';
import type { Campaign, Group } from './types';

/** Fixed ids, so the defaults are recognised and never added twice. */
export const DEFAULT_CAMPAIGN_IDS = { comment: 'default-comment', post: 'default-post' } as const;

/** Comments per group in the default comment campaign: what the owner comments by hand in one sitting. */
export const DEFAULT_COMMENTS_PER_GROUP = 25;

/**
 * Comment texts of the default comment campaign, about the owner's company (owner request, 2026-11-11).
 * They rotate across comments; `{group}` becomes the group name. No phone number: the owner adds contact
 * details by hand if wanted, since every comment carrying one looks like spam.
 */
export const DEFAULT_COMMENT_TEXTS: readonly string[] = [
  'Bên mình là Connecttech, chuyên làm website và web app theo yêu cầu. Bạn inbox mình tư vấn miễn phí nhé!',
  'Connecttech nhận thiết kế website bán hàng, giới thiệu doanh nghiệp, landing page. Bạn cần mình gửi mẫu tham khảo không ạ?',
  'Bạn tham khảo thử Connecttech nhé, bên mình làm web chuẩn giao diện điện thoại, tối ưu tốc độ. Inbox mình để được tư vấn ạ.',
  'Mình bên Connecttech, trước giờ làm khá nhiều web cho shop và spa. Bạn đang cần loại web nào, mình tư vấn qua cho ạ.',
  'Hay quá, đúng mảng bên mình đang làm. Connecttech có thể làm từ thiết kế tới chạy thực tế, bạn nhắn mình trao đổi thêm nha.',
  'Bạn ơi, nếu cần web app quản lý (đặt lịch, bán hàng, khách hàng…) thì Connecttech làm được, mình gửi demo cho bạn xem trước nhé.',
  'Chào cả nhà {group}! Connecttech nhận làm website, web app theo yêu cầu, ai cần cứ nhắn mình nhé.',
  'Bạn nào trong {group} cần làm web hoặc app cho cửa hàng thì ghé Connecttech nha, tư vấn miễn phí ạ.',
  'Bài hữu ích quá! Bên mình (Connecttech) cũng làm web, ai cần trao đổi kỹ thuật cứ nhắn mình nhé.',
  'Cảm ơn bạn chia sẻ. Nếu cần hỗ trợ làm website hay phần mềm, Connecttech luôn sẵn sàng ạ.',
];

/**
 * The two ready-made campaigns: fast comments and a regular post, on every saved group (up to the campaign
 * limit). The comment campaign comes with `DEFAULT_COMMENT_TEXTS`; the post text is left empty on purpose,
 * so a post run refuses to start until the user writes it.
 */
export function defaultCampaigns(groups: readonly Group[], now: number): Campaign[] {
  const groupIds = groups.slice(0, LIMITS.maxGroupsPerCampaign).map((g) => g.id);
  return [
    {
      id: DEFAULT_CAMPAIGN_IDS.comment,
      name: 'Bình luận nhanh',
      mode: 'comment',
      commentsPerGroup: DEFAULT_COMMENTS_PER_GROUP,
      variations: [...DEFAULT_COMMENT_TEXTS],
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

/**
 * Gives the default comment campaign the sample comments when its text is still empty (it was created before
 * the samples existed). Text the user wrote, and every other campaign, is left as it is.
 */
export function fillDefaultComments(campaigns: readonly Campaign[]): { campaigns: Campaign[]; filled: boolean } {
  let filled = false;
  const next = campaigns.map((c) => {
    if (c.id !== DEFAULT_CAMPAIGN_IDS.comment || c.variations.some((v) => v.trim())) return c;
    filled = true;
    return { ...c, variations: [...DEFAULT_COMMENT_TEXTS] };
  });
  return { campaigns: next, filled };
}

/**
 * Adds the default campaigns that are not in the list yet and fills an empty default comment campaign
 * (`fillDefaultComments`); anything else already there is left untouched.
 */
export function withDefaultCampaigns(campaigns: readonly Campaign[], groups: readonly Group[], now: number): { campaigns: Campaign[]; added: number; filled: boolean } {
  const { campaigns: current, filled } = fillDefaultComments(campaigns);
  const missing = defaultCampaigns(groups, now).filter((d) => !current.some((c) => c.id === d.id));
  return { campaigns: [...current, ...missing], added: missing.length, filled };
}
