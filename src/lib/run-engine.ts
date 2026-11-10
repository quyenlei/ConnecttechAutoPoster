import { randomDelaySec, randomGroupBreakSec, type Rng } from './delay';
import { LIMITS } from './limits';
import type { Campaign, LogEntry, PostOutcome, RunState } from './types';

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
  /** True when the same group will be tried again shortly instead of moving on. */
  retry: boolean;
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
  // A temporary error before anything was submitted gets one more try. Comments are never retried.
  if (outcome.kind === 'failed' && outcome.retryable && !state.retrying && campaign.mode !== 'comment') {
    return {
      state: { ...state, retrying: true, nextAt: now + LIMITS.retryDelayMs, reason: null },
      breakMinutes: null,
      retry: true,
    };
  }

  // The group has nothing left to comment, or cannot be used at all: drop its remaining slots.
  const skipGroup = campaign.mode === 'comment' && (outcome.kind === 'skipped' || outcome.kind === 'failed') && outcome.skipRemainingGroup === true;
  let consumed = 1;
  if (skipGroup) {
    while (consumed < state.queue.length && state.queue[consumed] === state.queue[0]) consumed++;
  }
  const queue = state.queue.slice(consumed);
  const attempted = state.attempted + consumed;
  const sinceBreak = state.sinceBreak + 1;
  const base = { ...state, queue, attempted, sinceBreak, retrying: undefined, nextAt: null as number | null, reason: null as string | null };

  if (outcome.kind === 'fatal') {
    return { state: { ...base, status: 'halted', reason: outcome.reason }, breakMinutes: null, retry: false };
  }

  const consecutiveFailures = outcome.kind === 'failed' ? state.consecutiveFailures + 1 : 0;
  base.consecutiveFailures = consecutiveFailures;

  // A comment that may have gone out but never showed up is the first sign of a silent limit: stop much sooner.
  const unconfirmed = campaign.mode === 'comment' && outcome.kind === 'failed' && !outcome.retryable && !skipGroup;
  if (consecutiveFailures >= LIMITS.maxConsecutiveFailures || (unconfirmed && consecutiveFailures >= LIMITS.maxUnconfirmedComments)) {
    return {
      state: { ...base, status: 'paused', reason: `${consecutiveFailures} failures in a row. Check Facebook, then resume.` },
      breakMinutes: null,
      retry: false,
    };
  }

  if (queue.length === 0) {
    return { state: { ...base, status: 'done' }, breakMinutes: null, retry: false };
  }

  const sb = campaign.safetyBreak;
  if (sb.enabled && sinceBreak >= sb.everyPosts) {
    return {
      state: { ...base, status: 'running', sinceBreak: 0, nextAt: now + sb.breakMinutes * 60_000 },
      breakMinutes: sb.breakMinutes,
      retry: false,
    };
  }

  // Comment campaigns wait a short delay inside a group and a longer break when moving on to another group.
  const waitSec = campaign.mode === 'comment' && queue[0] !== state.queue[0]
    ? randomGroupBreakSec(campaign.groupBreak, rng)
    : randomDelaySec(campaign.delay, rng, campaign.mode);

  return {
    state: { ...base, status: 'running', nextAt: now + waitSec * 1000 },
    breakMinutes: null,
    retry: false,
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
    nextAt: now + randomDelaySec(campaign.delay, rng, campaign.mode) * 1000,
  };
}

/**
 * Continues a run the user stopped. The wait before the next group is a fresh random delay, never instant.
 * A post the user stopped mid-flight may have gone out already, so post campaigns drop every queued
 * group that has a posted or pending log entry since the run started. Comment campaigns are protected
 * by the reserved post links instead.
 */
export function continueRun(state: RunState, campaign: Campaign, logs: LogEntry[], now: number, rng: Rng = Math.random): RunState {
  if (state.status !== 'stopped' || state.campaignId !== campaign.id) return state;
  const sent = new Set(
    logs
      .filter((l) => l.campaignId === campaign.id && l.ts >= (state.startedAt ?? 0) && (l.status === 'posted' || l.status === 'pending'))
      .map((l) => l.groupId),
  );
  const queue = campaign.mode === 'comment' ? state.queue : state.queue.filter((id) => !sent.has(id));
  const attempted = state.attempted + (state.queue.length - queue.length);
  const base = { ...state, queue, attempted, consecutiveFailures: 0, retrying: undefined, reason: null };
  if (queue.length === 0) return { ...base, status: 'done', nextAt: null };
  return { ...base, status: 'running', nextAt: now + randomDelaySec(campaign.delay, rng, campaign.mode) * 1000 };
}

export function stop(state: RunState): RunState {
  return state.status === 'running' || state.status === 'paused'
    ? { ...state, status: 'stopped', nextAt: null, reason: 'Bạn đã dừng.' }
    : state;
}

export function isActive(state: RunState): boolean {
  return state.status === 'running' || state.status === 'paused';
}

/** After Facebook showed a checkpoint or block during a comment run, comment runs stay locked until this time. */
export const commentLockUntil = (haltedAt: number): number => haltedAt + LIMITS.commentLockHours * 3_600_000;

export const isCommentLocked = (until: number | null, now: number): until is number => until !== null && until > now;
