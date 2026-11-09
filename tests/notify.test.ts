import { describe, expect, it } from 'vitest';
import { describeRunEnd } from '../src/lib/notify';
import { IDLE_RUN } from '../src/lib/run-engine';
import type { Campaign, RunState } from '../src/lib/types';

const campaign = (over: Partial<Campaign> = {}): Campaign => ({
  id: 'c1', name: 'Khuyến mãi', variations: ['A'], groupIds: ['g1'], delay: { minSec: 30, maxSec: 60 },
  safetyBreak: { enabled: false, everyPosts: 10, breakMinutes: 15 }, createdAt: 0, ...over,
});
const state = (over: Partial<RunState>): RunState => ({ ...IDLE_RUN, campaignId: 'c1', total: 4, attempted: 4, ...over });

describe('describeRunEnd', () => {
  it('announces completion with counts only', () => {
    const n = describeRunEnd('running', state({ status: 'done' }), campaign());
    expect(n).toEqual({ title: 'Chiến dịch hoàn tất', message: 'Khuyến mãi: đã xử lý 4/4 nhóm.' });
  });

  it('uses comment wording for comment campaigns', () => {
    expect(describeRunEnd('running', state({ status: 'done' }), campaign({ mode: 'comment' }))?.message).toContain('lượt bình luận');
  });

  it('announces an automatic pause and a halt with the reason', () => {
    expect(describeRunEnd('running', state({ status: 'paused', reason: '5 lần thất bại' }), campaign())?.message).toBe('Khuyến mãi: 5 lần thất bại');
    expect(describeRunEnd('running', state({ status: 'halted', reason: 'Bị chặn' }), campaign())?.title).toBe('Chiến dịch bị chặn');
  });

  it('stays silent for the user\'s own actions and for ongoing runs', () => {
    expect(describeRunEnd('running', state({ status: 'running' }), campaign())).toBeNull();
    expect(describeRunEnd('running', state({ status: 'stopped' }), campaign())).toBeNull();
    expect(describeRunEnd('paused', state({ status: 'done' }), campaign())).toBeNull();
  });
});
