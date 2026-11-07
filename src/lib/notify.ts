import type { Campaign, RunState, RunStatus } from './types';

export interface RunNotice {
  title: string;
  message: string;
}

/**
 * Text for the desktop notification when a running run ends, pauses by itself or is halted.
 * Returns null for any other transition, including the user's own Pause and Stop.
 * Only the campaign name and counts are used: never post text or group names.
 */
export function describeRunEnd(previous: RunStatus, next: RunState, campaign: Campaign): RunNotice | null {
  if (previous !== 'running') return null;
  const unit = campaign.mode === 'comment' ? 'lượt bình luận' : 'nhóm';
  switch (next.status) {
    case 'done':
      return { title: 'Chiến dịch hoàn tất', message: `${campaign.name}: đã xử lý ${next.attempted}/${next.total} ${unit}.` };
    case 'paused':
      return { title: 'Chiến dịch tạm dừng', message: `${campaign.name}: ${next.reason ?? 'cần bạn kiểm tra rồi tiếp tục.'}` };
    case 'halted':
      return { title: 'Chiến dịch bị chặn', message: `${campaign.name}: ${next.reason ?? 'Facebook yêu cầu kiểm tra hoặc chặn.'}` };
    default:
      return null;
  }
}
