export interface Group {
  id: string;
  name: string;
  /** Canonical URL: https://www.facebook.com/groups/<slug>/ */
  url: string;
}

export interface DelayRange {
  minSec: number;
  maxSec: number;
}

export interface SafetyBreak {
  enabled: boolean;
  /** Pause after this many attempted posts. */
  everyPosts: number;
  breakMinutes: number;
}

export interface Campaign {
  id: string;
  name: string;
  /** One or more post texts; they rotate across groups. */
  variations: string[];
  groupIds: string[];
  delay: DelayRange;
  safetyBreak: SafetyBreak;
  createdAt: number;
}

export type LogStatus = 'posted' | 'failed' | 'skipped' | 'break' | 'info';

export interface LogEntry {
  id: string;
  ts: number;
  campaignId: string;
  groupId: string;
  groupName: string;
  status: LogStatus;
  message: string;
}

export type RunStatus = 'idle' | 'running' | 'paused' | 'done' | 'stopped' | 'halted';

export interface RunState {
  status: RunStatus;
  campaignId: string | null;
  /** Group ids still to be processed, in order. */
  queue: string[];
  total: number;
  /** Groups already attempted. */
  attempted: number;
  consecutiveFailures: number;
  /** Attempts since the last Safety Break. */
  sinceBreak: number;
  /** Epoch ms of the next post; null when nothing is scheduled. */
  nextAt: number | null;
  reason: string | null;
}

export type PostOutcome =
  | { kind: 'posted' }
  | { kind: 'skipped'; reason: string }
  | { kind: 'failed'; reason: string }
  /** Facebook asked for a checkpoint / rate limit warning: stop everything. */
  | { kind: 'fatal'; reason: string };
