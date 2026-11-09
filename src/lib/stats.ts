import type { LogEntry } from './types';

export interface Tally {
  /** Posts and comments that went out, including posts waiting for admin approval. */
  sent: number;
  pending: number;
  failed: number;
  /** sent / (sent + failed), 0..1; null when nothing was attempted. Skipped groups are not counted. */
  successRate: number | null;
}

export interface Summary {
  today: Tally;
  last7Days: Tally;
}

const DAY_MS = 86_400_000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function tally(logs: LogEntry[]): Tally {
  let sent = 0;
  let pending = 0;
  let failed = 0;
  for (const l of logs) {
    if (l.status === 'posted') sent++;
    else if (l.status === 'pending') {
      sent++;
      pending++;
    } else if (l.status === 'failed') failed++;
  }
  const attempts = sent + failed;
  return { sent, pending, failed, successRate: attempts === 0 ? null : sent / attempts };
}

/** Today = since local midnight. Last 7 days = today plus the 6 days before it. */
export function summarize(logs: LogEntry[], now: number): Summary {
  const todayStart = startOfDay(now);
  // Walk back whole calendar days so a DST change cannot shift the window by an hour.
  const weekStart = startOfDay(todayStart - 6 * DAY_MS + DAY_MS / 2);
  return {
    today: tally(logs.filter((l) => l.ts >= todayStart && l.ts <= now)),
    last7Days: tally(logs.filter((l) => l.ts >= weekStart && l.ts <= now)),
  };
}
