import { describe, expect, it } from 'vitest';
import { applyOutcome, continueRun, createRun, pause, pickVariation, resume, stop } from '../src/lib/run-engine';
import { LIMITS } from '../src/lib/limits';
import type { Campaign, LogEntry } from '../src/lib/types';

const campaign = (over: Partial<Campaign> = {}): Campaign => ({
  id: 'c1',
  name: 'Test',
  variations: ['A', 'B'],
  groupIds: ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'],
  delay: { minSec: 60, maxSec: 60 },
  safetyBreak: { enabled: false, everyPosts: 3, breakMinutes: 10 },
  createdAt: 0,
  ...over,
});
const NOW = 1_000_000;
const ok = { kind: 'posted' } as const;
const fail = { kind: 'failed', reason: 'x' } as const;

describe('run engine', () => {
  it('first post is due immediately', () => {
    const s = createRun(campaign(), NOW);
    expect(s.status).toBe('running');
    expect(s.nextAt).toBe(NOW);
    expect(s.queue).toHaveLength(7);
  });

  it('counts each comment as a separate delayed attempt', () => {
    const c = campaign({ mode: 'comment', commentsPerGroup: 2, groupIds: ['g1', 'g2'] });
    const run = createRun(c, NOW);
    expect(run.queue).toEqual(['g1', 'g1', 'g2', 'g2']);
    expect(run.total).toBe(4);
    expect(applyOutcome(run, c, ok, NOW).state.nextAt).toBe(NOW + 60_000);
  });

  it('moves to the next group when no more identifiable posts remain', () => {
    const c = campaign({ mode: 'comment', commentsPerGroup: 5, groupIds: ['g1', 'g2'] });
    let run = createRun(c, NOW);
    run = applyOutcome(run, c, ok, NOW).state;
    run = applyOutcome(run, c, { kind: 'skipped', reason: 'no posts', skipRemainingGroup: true }, NOW).state;
    expect(run.queue).toEqual(['g2', 'g2', 'g2', 'g2', 'g2']);
    expect(run.attempted).toBe(5);
    expect(run.nextAt).toBe(NOW);
  });

  it('keeps the safety break when advancing past a group', () => {
    const c = campaign({ mode: 'comment', commentsPerGroup: 2, groupIds: ['g1', 'g2'], safetyBreak: { enabled: true, everyPosts: 1, breakMinutes: 10 } });
    const result = applyOutcome(createRun(c, NOW), c, { kind: 'skipped', reason: 'no posts', skipRemainingGroup: true }, NOW);
    expect(result.state.queue).toEqual(['g2', 'g2']);
    expect(result.state.nextAt).toBe(NOW + 600_000);
  });

  it('schedules the next post after the delay and consumes the queue', () => {
    const c = campaign();
    const { state } = applyOutcome(createRun(c, NOW), c, ok, NOW);
    expect(state.queue[0]).toBe('g2');
    expect(state.attempted).toBe(1);
    expect(state.nextAt).toBe(NOW + 60_000);
  });

  it('finishes when the queue is empty', () => {
    const c = campaign({ groupIds: ['g1'] });
    const { state } = applyOutcome(createRun(c, NOW), c, ok, NOW);
    expect(state.status).toBe('done');
    expect(state.nextAt).toBeNull();
  });

  it('inserts a Safety Break every N attempts', () => {
    const c = campaign({ safetyBreak: { enabled: true, everyPosts: 2, breakMinutes: 10 } });
    let s = createRun(c, NOW);
    s = applyOutcome(s, c, ok, NOW).state;
    const r = applyOutcome(s, c, ok, NOW);
    expect(r.breakMinutes).toBe(10);
    expect(r.state.nextAt).toBe(NOW + 600_000);
    expect(r.state.sinceBreak).toBe(0);
  });

  it('auto-pauses after 5 failures in a row', () => {
    const c = campaign();
    let s = createRun(c, NOW);
    for (let i = 0; i < 4; i++) s = applyOutcome(s, c, fail, NOW).state;
    expect(s.status).toBe('running');
    s = applyOutcome(s, c, fail, NOW).state;
    expect(s.status).toBe('paused');
    expect(s.nextAt).toBeNull();
  });

  it('a success or skip resets the failure streak', () => {
    const c = campaign();
    let s = createRun(c, NOW);
    for (let i = 0; i < 4; i++) s = applyOutcome(s, c, fail, NOW).state;
    s = applyOutcome(s, c, { kind: 'skipped', reason: 'pending' }, NOW).state;
    expect(s.consecutiveFailures).toBe(0);
  });

  it('halts immediately on a fatal outcome', () => {
    const c = campaign();
    const { state } = applyOutcome(createRun(c, NOW), c, { kind: 'fatal', reason: 'checkpoint' }, NOW);
    expect(state.status).toBe('halted');
    expect(state.reason).toBe('checkpoint');
    expect(state.nextAt).toBeNull();
  });

  it('pause / resume / stop', () => {
    const c = campaign();
    const running = createRun(c, NOW);
    const paused = pause(running);
    expect(paused.status).toBe('paused');
    const resumed = resume(paused, c, NOW + 5);
    expect(resumed.status).toBe('running');
    expect(resumed.nextAt).toBe(NOW + 5 + 60_000);
    expect(stop(resumed).status).toBe('stopped');
    expect(stop(stop(resumed)).status).toBe('stopped');
    expect(resume(running, c, NOW)).toBe(running);
  });

  it('rotates variations and ignores blanks', () => {
    expect([0, 1, 2].map((i) => pickVariation(['A', 'B'], i))).toEqual(['A', 'B', 'A']);
    expect(pickVariation(['', '  '], 0)).toBe('');
  });
});

describe('retry after a temporary error', () => {
  const temporary = { kind: 'failed', reason: 'Trang nhóm tải quá lâu.', retryable: true } as const;

  it('retries the same group once after 8 seconds without counting a failure', () => {
    const c = campaign();
    const run = createRun(c, NOW);
    const first = applyOutcome(run, c, temporary, NOW);
    expect(first.retry).toBe(true);
    expect(first.state.queue).toEqual(run.queue);
    expect(first.state.attempted).toBe(0);
    expect(first.state.consecutiveFailures).toBe(0);
    expect(first.state.nextAt).toBe(NOW + LIMITS.retryDelayMs);
    expect(first.state.status).toBe('running');
  });

  it('moves on and counts one failure when the retry fails too', () => {
    const c = campaign();
    const first = applyOutcome(createRun(c, NOW), c, temporary, NOW).state;
    const second = applyOutcome(first, c, temporary, NOW + 8000);
    expect(second.retry).toBe(false);
    expect(second.state.queue).toHaveLength(6);
    expect(second.state.consecutiveFailures).toBe(1);
    expect(second.state.retrying).toBeUndefined();
    expect(second.state.nextAt).toBe(NOW + 8000 + 60_000);
  });

  it('allows a fresh retry for the next group after a successful retry', () => {
    const c = campaign();
    const retrying = applyOutcome(createRun(c, NOW), c, temporary, NOW).state;
    const done = applyOutcome(retrying, c, ok, NOW + 8000).state;
    expect(done.retrying).toBeUndefined();
    expect(applyOutcome(done, c, temporary, NOW + 70_000).retry).toBe(true);
  });

  it('never retries a failure that may have been submitted', () => {
    const c = campaign();
    const result = applyOutcome(createRun(c, NOW), c, fail, NOW);
    expect(result.retry).toBe(false);
    expect(result.state.queue).toHaveLength(6);
    expect(result.state.consecutiveFailures).toBe(1);
  });

  it('never retries comment campaigns', () => {
    const c = campaign({ mode: 'comment', commentsPerGroup: 1 });
    const result = applyOutcome(createRun(c, NOW), c, temporary, NOW);
    expect(result.retry).toBe(false);
    expect(result.state.consecutiveFailures).toBe(1);
  });
});

describe('pending approval', () => {
  it('counts as an attempt and resets the failure streak', () => {
    const c = campaign();
    let run = createRun(c, NOW);
    run = applyOutcome(run, c, fail, NOW).state;
    const after = applyOutcome(run, c, { kind: 'pending' }, NOW).state;
    expect(after.consecutiveFailures).toBe(0);
    expect(after.attempted).toBe(2);
    expect(after.status).toBe('running');
  });
});

describe('continue a stopped run', () => {
  const log = (groupId: string, status: LogEntry['status'], ts = NOW, campaignId = 'c1'): LogEntry => ({
    id: `${groupId}-${status}-${ts}`, ts, campaignId, groupId, groupName: groupId, status, message: '',
  });
  const stopped = (c: Campaign, attempts: number) => {
    let run = createRun(c, NOW);
    for (let i = 0; i < attempts; i++) run = applyOutcome(run, c, ok, NOW).state;
    return stop(run);
  };

  it('waits a fresh delay and keeps the remaining groups', () => {
    const c = campaign();
    const next = continueRun(stopped(c, 2), c, [], NOW + 5);
    expect(next.status).toBe('running');
    expect(next.queue).toEqual(['g3', 'g4', 'g5', 'g6', 'g7']);
    expect(next.nextAt).toBe(NOW + 5 + 60_000);
    expect(next.reason).toBeNull();
  });

  it('skips a group that was posted while the user pressed Stop', () => {
    const c = campaign();
    const run = stopped(c, 2); // g3 is still first in the queue
    const next = continueRun(run, c, [log('g3', 'posted')], NOW + 5);
    expect(next.queue).toEqual(['g4', 'g5', 'g6', 'g7']);
    expect(next.attempted).toBe(3);
    expect(next.total).toBe(7);
  });

  it('treats a pending post as sent', () => {
    const c = campaign();
    expect(continueRun(stopped(c, 2), c, [log('g3', 'pending')], NOW).queue[0]).toBe('g4');
  });

  it('ignores failed or skipped logs, other campaigns and entries from earlier runs', () => {
    const c = campaign();
    const logs = [log('g3', 'failed'), log('g3', 'skipped'), log('g3', 'posted', NOW, 'other'), log('g3', 'posted', NOW - 1)];
    expect(continueRun(stopped(c, 2), c, logs, NOW).queue[0]).toBe('g3');
  });

  it('finishes when nothing is left to do', () => {
    const c = campaign({ groupIds: ['g1', 'g2'] });
    const next = continueRun(stopped(c, 1), c, [log('g2', 'posted')], NOW);
    expect(next.status).toBe('done');
    expect(next.queue).toEqual([]);
    expect(next.nextAt).toBeNull();
  });

  it('keeps every comment slot: duplicates are blocked by reserved post links', () => {
    const c = campaign({ mode: 'comment', commentsPerGroup: 2, groupIds: ['g1', 'g2'] });
    const run = stopped(c, 1);
    expect(continueRun(run, c, [log('g1', 'posted')], NOW).queue).toEqual(run.queue);
  });

  it('only continues a stopped run of the same campaign', () => {
    const c = campaign();
    const running = createRun(c, NOW);
    expect(continueRun(running, c, [], NOW)).toBe(running);
    const halted = { ...stopped(c, 1), status: 'halted' as const };
    expect(continueRun(halted, c, [], NOW)).toBe(halted);
    const stoppedOther = stopped(campaign({ id: 'other' }), 1);
    expect(continueRun(stoppedOther, c, [], NOW)).toBe(stoppedOther);
  });
});
