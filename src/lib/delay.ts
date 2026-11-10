import { DEFAULT_COMMENT_DELAY, DEFAULT_GROUP_BREAK, LIMITS } from './limits';
import type { Campaign, DelayRange } from './types';

export type Rng = () => number;
type Mode = Campaign['mode'];

/** Comment campaigns have their own, shorter minimum; everything else keeps the post minimum. */
export const minDelayFor = (mode?: Mode): number => (mode === 'comment' ? LIMITS.minCommentDelaySec : LIMITS.minDelaySec);

function clampRange(range: DelayRange, min: number, max: number): DelayRange {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min)));
  const minSec = clamp(range.minSec);
  return { minSec, maxSec: Math.max(minSec, clamp(range.maxSec)) };
}

const pick = ({ minSec, maxSec }: DelayRange, rng: Rng): number => Math.round(minSec + rng() * (maxSec - minSec));

/** Random whole seconds in [minSec, maxSec]. */
export function randomDelaySec(range: DelayRange, rng: Rng = Math.random, mode?: Mode): number {
  return pick(clampDelay(range, mode), rng);
}

export function clampDelay(range: DelayRange, mode?: Mode): DelayRange {
  return clampRange(range, minDelayFor(mode), LIMITS.maxDelaySec);
}

/** Comment campaigns: the wait when moving on to another group. A campaign without one gets the default. */
export function clampGroupBreak(range: DelayRange | undefined): DelayRange {
  return clampRange(range ?? DEFAULT_GROUP_BREAK, LIMITS.minGroupBreakSec, LIMITS.maxGroupBreakSec);
}

export function randomGroupBreakSec(range: DelayRange | undefined, rng: Rng = Math.random): number {
  return pick(clampGroupBreak(range), rng);
}

/** Conservative suggestion for posts; more groups means longer waits. Comments use their own fixed default. */
export function recommendDelay(groupCount: number, mode?: Mode): DelayRange {
  if (mode === 'comment') return { ...DEFAULT_COMMENT_DELAY };
  if (groupCount <= 10) return { minSec: 90, maxSec: 180 };
  if (groupCount <= 30) return { minSec: 150, maxSec: 300 };
  return { minSec: 240, maxSec: 480 };
}

/** `fast-comment`: a comment campaign waits less than the post minimum, which Facebook may treat as spam. */
export type DelayWarning = 'too-fast' | 'fast-comment' | 'fixed-time' | null;

export function delayWarning(range: DelayRange, groupCount: number, mode?: Mode): DelayWarning {
  if (mode === 'comment') {
    if (range.minSec < LIMITS.minDelaySec) return 'fast-comment';
    return range.minSec === range.maxSec ? 'fixed-time' : null;
  }
  const rec = recommendDelay(groupCount);
  if (range.minSec < rec.minSec / 2) return 'too-fast';
  if (range.minSec === range.maxSec) return 'fixed-time';
  return null;
}

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}
