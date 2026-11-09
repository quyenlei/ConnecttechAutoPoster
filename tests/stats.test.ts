import { describe, expect, it } from 'vitest';
import { summarize } from '../src/lib/stats';
import type { LogEntry, LogStatus } from '../src/lib/types';

const NOW = new Date(2026, 10, 7, 15, 0, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const entry = (status: LogStatus, ts: number): LogEntry => ({ id: `${status}${ts}`, ts, campaignId: 'c', groupId: 'g', groupName: 'G', status, message: '' });

describe('summarize', () => {
  it('counts today since local midnight', () => {
    const logs = [entry('posted', NOW - HOUR), entry('failed', NOW - 2 * HOUR), entry('posted', NOW - 16 * HOUR)];
    const { today } = summarize(logs, NOW);
    expect(today.sent).toBe(1);
    expect(today.failed).toBe(1);
    expect(today.successRate).toBe(0.5);
  });

  it('covers today plus the 6 days before it', () => {
    const logs = [entry('posted', NOW - 6 * DAY), entry('posted', NOW - 7 * DAY), entry('failed', NOW - 3 * DAY)];
    const { last7Days } = summarize(logs, NOW);
    expect(last7Days.sent).toBe(1);
    expect(last7Days.failed).toBe(1);
  });

  it('counts pending posts as sent and skipped, break and info as neither', () => {
    const logs = [entry('pending', NOW - HOUR), entry('skipped', NOW - HOUR), entry('break', NOW - HOUR), entry('info', NOW - HOUR)];
    const { today } = summarize(logs, NOW);
    expect(today).toEqual({ sent: 1, pending: 1, failed: 0, successRate: 1 });
  });

  it('has no rate when nothing was attempted and ignores future entries', () => {
    expect(summarize([], NOW).last7Days.successRate).toBeNull();
    expect(summarize([entry('posted', NOW + HOUR)], NOW).today.sent).toBe(0);
  });
});
