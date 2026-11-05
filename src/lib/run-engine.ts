import { randomDelaySec, type Rng } from './delay';
import { LIMITS } from './limits';
import type { Campaign, PostOutcome, RunState } from './types';

export const IDLE_RUN: RunState = {
  status: 'idle',
  campaignId: null,
  queue: [],
  total: 0,
  attempted: 0,
  consecutiveFailures: 0,
  sinceBreak: 0,
  nextAt: null,
  reason: null,
};

/** Starts a run. The first post is due immediately; waits only apply between posts. */
export function createRun(campaign: Campaign, now: number): RunState {
  const queue = campaign.mode === 'comment'
    ? campaign.groupIds.flatMap((id) => Array.from({ length: campaign.commentsPerGroup ?? 1 }, () => id))
    : [...campaign.groupIds];
  return {
    ...IDLE_RUN,
    status: 'running',
    startedAt: now,
    campaignId: campaign.id,
    queue,
    total: queue.length,
    nextAt: now,
  };
}

/** Text for the n-th attempt; variations rotate so consecutive groups differ. */
export function pickVariation(variations: string[], attemptIndex: number): string {
  const usable = variations.map((v) => v.trim()).filter(Boolean);
  if (usable.length === 0) return '';
  return usable[attemptIndex % usable.length] as string;
}

export interface StepResult {
  state: RunState;
  /** Set when a Safety Break was just scheduled. */
  breakMinutes: number | null;
}

/**
 * Pure transition after one group was attempted.
 * Keeps all safety rules (auto-pause, break, fatal stop) in one testable place.
 */
export function applyOutcome(
  state: RunState,
  campaign: Campaign,
  outcome: PostOutcome,
  now: number,
  rng: Rng = Math.random,
): StepResult {
  let consumed = 1;
  if (campaign.mode === 'comment' && outcome.kind === 'skipped' && outcome.skipRemainingGroup) {
    while (consumed < state.queue.length && state.queue[consumed] === state.queue[0]) consumed++;
  }
  const queue = state.queue.slice(consumed);
  const attempted = state.attempted + consumed;
  const sinceBreak = state.sinceBreak + 1;
  const base = { ...state, queue, attempted, sinceBreak, nextAt: null as number | null, reason: null as string | null };

  if (outcome.kind === 'fatal') {
    return { state: { ...base, status: 'halted', reason: outcome.reason }, breakMinutes: null };
  }

  const consecutiveFailures = outcome.kind === 'failed' ? state.consecutiveFailures + 1 : 0;
  base.consecutiveFailures = consecutiveFailures;

  if (consecutiveFailures >= LIMITS.maxConsecutiveFailures) {
    return {
      state: { ...base, status: 'paused', reason: `${consecutiveFailures} failures in a row. Check Facebook, then resume.` },
      breakMinutes: null,
    };
  }

  if (queue.length === 0) {
    return { state: { ...base, status: 'done' }, breakMinutes: null };
  }

  const sb = campaign.safetyBreak;
  if (sb.enabled && sinceBreak >= sb.everyPosts) {
    return {
      state: { ...base, status: 'running', sinceBreak: 0, nextAt: now + sb.breakMinutes * 60_000 },
      breakMinutes: sb.breakMinutes,
    };
  }

  // The previous attempt already waited its delay before this read-only scan.
  if (campaign.mode === 'comment' && outcome.kind === 'skipped' && outcome.skipRemainingGroup) {
    return { state: { ...base, status: 'running', nextAt: now }, breakMinutes: null };
  }

  return {
    state: { ...base, status: 'running', nextAt: now + randomDelaySec(campaign.delay, rng) * 1000 },
    breakMinutes: null,
  };
}

export function pause(state: RunState): RunState {
  return state.status === 'running' ? { ...state, status: 'paused', nextAt: null, reason: 'Bạn đã tạm dừng.' } : state;
}

/** Resume: the next post is due after a fresh random wait, never instantly. */
export function resume(state: RunState, campaign: Campaign, now: number, rng: Rng = Math.random): RunState {
  if (state.status !== 'paused') return state;
  return {
    ...state,
    status: 'running',
    consecutiveFailures: 0,
    reason: null,
    nextAt: now + randomDelaySec(campaign.delay, rng) * 1000,
  };
}

export function stop(state: RunState): RunState {
  return state.status === 'running' || state.status === 'paused'
    ? { ...state, status: 'stopped', nextAt: null, reason: 'Bạn đã dừng.' }
    : state;
}

export function isActive(state: RunState): boolean {
  return state.status === 'running' || state.status === 'paused';
}
