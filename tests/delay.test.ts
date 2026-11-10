import { describe, expect, it } from 'vitest';
import { clampDelay, clampGroupBreak, delayWarning, formatDuration, minDelayFor, randomDelaySec, randomGroupBreakSec, recommendDelay } from '../src/lib/delay';

describe('delay', () => {
  it('stays inside the range', () => {
    const r = { minSec: 60, maxSec: 120 };
    expect(randomDelaySec(r, () => 0)).toBe(60);
    expect(randomDelaySec(r, () => 0.999999)).toBe(120);
  });
  it('never goes below the hard minimum', () => {
    expect(clampDelay({ minSec: 1, maxSec: 2 })).toEqual({ minSec: 30, maxSec: 30 });
    expect(randomDelaySec({ minSec: 0, maxSec: 0 }, () => 0.5)).toBe(30);
  });
  it('fixes max < min and NaN', () => {
    expect(clampDelay({ minSec: 100, maxSec: 50 })).toEqual({ minSec: 100, maxSec: 100 });
    expect(clampDelay({ minSec: NaN, maxSec: NaN }).minSec).toBe(30);
  });
  it('recommends longer waits for more groups', () => {
    expect(recommendDelay(5).minSec).toBeLessThan(recommendDelay(50).minSec);
  });
  it('warns on risky settings', () => {
    expect(delayWarning({ minSec: 30, maxSec: 60 }, 20)).toBe('too-fast');
    expect(delayWarning({ minSec: 150, maxSec: 150 }, 20)).toBe('fixed-time');
    expect(delayWarning({ minSec: 150, maxSec: 300 }, 20)).toBeNull();
  });
  it('gives comment campaigns their own, shorter minimum', () => {
    expect(minDelayFor('comment')).toBe(2);
    expect(minDelayFor('post')).toBe(30);
    expect(minDelayFor(undefined)).toBe(30);
    expect(clampDelay({ minSec: 0, maxSec: 1 }, 'comment')).toEqual({ minSec: 2, maxSec: 2 });
    expect(clampDelay({ minSec: 2, maxSec: 4 }, 'comment')).toEqual({ minSec: 2, maxSec: 4 });
    expect(clampDelay({ minSec: 2, maxSec: 4 }, 'post')).toEqual({ minSec: 30, maxSec: 30 });
    expect(randomDelaySec({ minSec: 2, maxSec: 4 }, () => 0.5, 'comment')).toBe(3);
    expect(recommendDelay(50, 'comment')).toEqual({ minSec: 2, maxSec: 4 });
  });
  it('clamps the break between groups and falls back to the default', () => {
    expect(clampGroupBreak(undefined)).toEqual({ minSec: 10, maxSec: 20 });
    expect(clampGroupBreak({ minSec: 0, maxSec: 5 })).toEqual({ minSec: 10, maxSec: 10 });
    expect(clampGroupBreak({ minSec: 60, maxSec: 99_999 })).toEqual({ minSec: 60, maxSec: 3600 });
    expect(randomGroupBreakSec(undefined, () => 0)).toBe(10);
    expect(randomGroupBreakSec({ minSec: 30, maxSec: 40 }, () => 0.999999)).toBe(40);
  });
  it('warns when comments are closer together than the post minimum', () => {
    expect(delayWarning({ minSec: 2, maxSec: 4 }, 3, 'comment')).toBe('fast-comment');
    expect(delayWarning({ minSec: 30, maxSec: 60 }, 3, 'comment')).toBeNull();
    expect(delayWarning({ minSec: 45, maxSec: 45 }, 3, 'comment')).toBe('fixed-time');
  });
  it('formats durations', () => {
    expect(formatDuration(5)).toBe('5s');
    expect(formatDuration(125)).toBe('2m 05s');
    expect(formatDuration(3700)).toBe('1h 1m');
  });
});
