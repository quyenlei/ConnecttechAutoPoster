import { describe, expect, it } from 'vitest';
import { dueOccurrences, isMissed, nextOccurrence, normalizeTimes, validateTimes } from '../src/lib/schedule';

const at = (h: number, m = 0, day = 5) => new Date(2026, 10, day, h, m, 0, 0).getTime();

describe('normalizeTimes', () => {
  it('drops invalid values, removes duplicates and sorts', () => {
    expect(normalizeTimes(['14:00', '07:00', '7:00', '25:00', '12:60', '', 'abc', '14:00'])).toEqual(['07:00', '14:00']);
  });
  it('accepts the day boundaries', () => {
    expect(normalizeTimes(['23:59', '00:00'])).toEqual(['00:00', '23:59']);
  });
});

describe('validateTimes', () => {
  it('accepts none, one or two well-spaced times', () => {
    expect(validateTimes([])).toBeNull();
    expect(validateTimes(['07:00'])).toBeNull();
    expect(validateTimes(['07:00', '14:00'])).toBeNull();
  });
  it('accepts exactly 6 hours apart', () => {
    expect(validateTimes(['07:00', '13:00'])).toBeNull();
  });
  it('rejects 5 hours 59 minutes apart', () => {
    expect(validateTimes(['07:00', '12:59'])).not.toBeNull();
  });
  it('rejects 07:00 and 12:00', () => {
    expect(validateTimes(['07:00', '12:00'])).not.toBeNull();
  });
  it('counts the gap across midnight', () => {
    expect(validateTimes(['02:00', '07:00'])).not.toBeNull(); // 5h via midnight
    expect(validateTimes(['01:00', '07:00'])).toBeNull(); // exactly 6h via midnight
    expect(validateTimes(['08:00', '20:00'])).toBeNull();
  });
  it('rejects more than the daily maximum', () => {
    expect(validateTimes(['01:00', '09:00', '17:00'])).not.toBeNull();
  });
  it('is independent of input order', () => {
    expect(validateTimes(['14:00', '07:00'])).toBeNull();
  });
});

describe('nextOccurrence', () => {
  it('returns null without times', () => {
    expect(nextOccurrence([], at(8))).toBeNull();
  });
  it('picks the next time later today', () => {
    expect(nextOccurrence(['07:00', '14:00'], at(8))).toBe(at(14));
    expect(nextOccurrence(['07:00', '14:00'], at(6))).toBe(at(7));
  });
  it('rolls to the first time tomorrow after the last one', () => {
    expect(nextOccurrence(['07:00', '14:00'], at(15))).toBe(at(7, 0, 6));
  });
  it('treats a time equal to now as still upcoming', () => {
    expect(nextOccurrence(['07:00', '14:00'], at(7))).toBe(at(7));
  });
  it('moves on one millisecond after a time', () => {
    expect(nextOccurrence(['07:00', '14:00'], at(7) + 1)).toBe(at(14));
  });
  it('crosses a month boundary', () => {
    const now = new Date(2026, 0, 31, 23, 0).getTime();
    expect(nextOccurrence(['07:00'], now)).toBe(new Date(2026, 1, 1, 7, 0).getTime());
  });
});

describe('isMissed', () => {
  it('allows up to 10 minutes late', () => {
    expect(isMissed(at(7), at(7))).toBe(false);
    expect(isMissed(at(7), at(7, 10))).toBe(false);
  });
  it('misses anything later than 10 minutes', () => {
    expect(isMissed(at(7), at(7, 10) + 1)).toBe(true);
    expect(isMissed(at(7), at(9))).toBe(true);
  });
});

describe('dueOccurrences', () => {
  it('lists times in (since, now]', () => {
    expect(dueOccurrences(['07:00', '14:00'], at(6), at(8))).toEqual([at(7)]);
    expect(dueOccurrences(['07:00', '14:00'], at(6), at(15))).toEqual([at(7), at(14)]);
  });
  it('excludes since and includes now', () => {
    expect(dueOccurrences(['07:00'], at(7), at(8))).toEqual([]);
    expect(dueOccurrences(['07:00'], at(6), at(7))).toEqual([at(7)]);
  });
  it('spans several days in order', () => {
    expect(dueOccurrences(['07:00'], at(8), at(8, 0, 7))).toEqual([at(7, 0, 6), at(7, 0, 7)]);
  });
  it('returns nothing when since is not before now', () => {
    expect(dueOccurrences(['07:00'], at(9), at(8))).toEqual([]);
  });
});
