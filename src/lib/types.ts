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

/** Opt-in daily start times, local time of this device. */
export interface CampaignSchedule {
  enabled: boolean;
  /** "HH:mm", 24-hour. */
  times: string[];
}

export interface Campaign {
  id: string;
  name: string;
  /** Older campaigns without a mode remain post campaigns. */
  mode?: 'post' | 'comment';
  commentsPerGroup?: number;
  /** One or more post texts; they rotate across groups. */
  variations: string[];
  groupIds: string[];
  delay: DelayRange;
  safetyBreak: SafetyBreak;
  schedule?: CampaignSchedule;
  createdAt: number;
}

/** `pending`: submitted, but the group admins must approve the post first. */
export type LogStatus = 'posted' | 'pending' | 'failed' | 'skipped' | 'break' | 'info';

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
  startedAt?: number;
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
  /** True while the current group is being retried once after a temporary error. */
  retrying?: boolean;
}

/** Local preferences. Everything is off until the user turns it on. */
export interface Settings {
  /** Show a desktop notification when a run finishes, pauses or is halted. */
  notifyOnFinish: boolean;
}

export type PostOutcome =
  | { kind: 'posted' }
  /** Submitted, but the group needs admin approval before the post is visible. */
  | { kind: 'pending' }
  | { kind: 'skipped'; reason: string; skipRemainingGroup?: boolean }
  /** `retryable` is only set when nothing was submitted, so a second attempt cannot double-post. */
  | { kind: 'failed'; reason: string; retryable?: boolean }
  /** Facebook asked for a checkpoint / rate limit warning: stop everything. */
  | { kind: 'fatal'; reason: string };
