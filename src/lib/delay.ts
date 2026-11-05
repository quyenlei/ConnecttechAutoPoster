import { LIMITS } from './limits';
import type { DelayRange } from './types';

export type Rng = () => number;

/** Random whole seconds in [minSec, maxSec]. */
export function randomDelaySec(range: DelayRange, rng: Rng = Math.random): number {
  const { minSec, maxSec } = clampDelay(range);
  return Math.round(minSec + rng() * (maxSec - minSec));
}

export function clampDelay(range: DelayRange): DelayRange {
  const clamp = (n: number) =>
    Math.min(LIMITS.maxDelaySec, Math.max(LIMITS.minDelaySec, Math.round(Number.isFinite(n) ? n : LIMITS.minDelaySec)));
  const minSec = clamp(range.minSec);
  return { minSec, maxSec: Math.max(minSec, clamp(range.maxSec)) };
}

/** Conservative suggestion; more groups means longer waits. */
export function recommendDelay(groupCount: number): DelayRange {
  if (groupCount <= 10) return { minSec: 90, maxSec: 180 };
  if (groupCount <= 30) return { minSec: 150, maxSec: 300 };
  return { minSec: 240, maxSec: 480 };
}

export type DelayWarning = 'too-fast' | 'fixed-time' | null;

export function delayWarning(range: DelayRange, groupCount: number): DelayWarning {
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
