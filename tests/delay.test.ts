import { describe, expect, it } from 'vitest';
import { clampDelay, delayWarning, formatDuration, randomDelaySec, recommendDelay } from '../src/lib/delay';

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
  it('formats durations', () => {
    expect(formatDuration(5)).toBe('5s');
    expect(formatDuration(125)).toBe('2m 05s');
    expect(formatDuration(3700)).toBe('1h 1m');
  });
});
