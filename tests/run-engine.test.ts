import { describe, expect, it } from 'vitest';
import { applyOutcome, createRun, pause, pickVariation, resume, stop } from '../src/lib/run-engine';
import type { Campaign } from '../src/lib/types';

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
