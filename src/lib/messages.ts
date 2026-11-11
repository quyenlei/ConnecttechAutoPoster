import type { FeedMode } from './comment-pick';
import type { FoundGroup } from './groups';
import type { PostOutcome } from './types';

/** Background -> content script (group page). */
export interface PostImage {
  name: string;
  mime: string;
  dataUrl: string;
}

export interface PostRequest {
  type: 'cap/post';
  /** Final text: placeholders are already replaced by the background. */
  text: string;
  /** Sent with the post request only, read from the campaign at that moment. */
  images?: PostImage[];
  removeLinkPreview?: boolean;
}

/**
 * Comment campaigns: scan the open group feed (scrolling it) and choose one post, then comment on it.
 * The choice stays in the page; the background reserves `keys` before asking for the comment.
 */
export interface FeedPickRequest {
  type: 'cap/feed-pick';
  groupId: string;
  mode: FeedMode;
  /** `commentedPosts` keys of this group (post links and `feed:` fingerprints) already tried. */
  tried: string[];
  /** The campaign's comment texts, to recognise a comment already sent with one of them. */
  ownTexts: string[];
}

export interface FeedPickReply {
  fingerprint?: string;
  post?: { url: string | null; author: string; text: string; age: string | null };
  /** Keys to reserve in `commentedPosts` for the chosen post. */
  keys?: string[];
  diagnostic?: string;
  /** Diagnostic only: per post looked at, its fingerprint, the decision and the time label. Never post text. */
  trace?: string[];
  problem?: { kind: 'fatal' | 'skipped' | 'failed'; reason: string };
}

export interface FeedCommentRequest {
  type: 'cap/feed-comment';
  /** Must match the post chosen by the last `cap/feed-pick`. */
  fingerprint: string;
  text: string;
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

export const isFeedPickRequest = (m: unknown): m is FeedPickRequest => {
  if (typeof m !== 'object' || m === null) return false;
  const r = m as Partial<Record<keyof FeedPickRequest, unknown>>;
  return r.type === 'cap/feed-pick' && typeof r.groupId === 'string' && (r.mode === 'recent' || r.mode === 'newest') && isStringArray(r.tried) && isStringArray(r.ownTexts);
};

export const isFeedCommentRequest = (m: unknown): m is FeedCommentRequest =>
  typeof m === 'object' && m !== null && (m as { type?: unknown }).type === 'cap/feed-comment' &&
  typeof (m as { text?: unknown }).text === 'string' && typeof (m as { fingerprint?: unknown }).fingerprint === 'string';

/** Background -> content script on facebook.com/groups/joins/: read the groups the user joined. Read-only. */
export interface JoinedGroupsRequest {
  type: 'cap/joined-groups';
}

export interface JoinedGroupsReply {
  groups: FoundGroup[];
  /** The count Facebook shows in the section heading, to compare with what was read. */
  expected?: number;
  problem?: { fatal: boolean; reason: string };
}

export const isJoinedGroupsRequest = (m: unknown): m is JoinedGroupsRequest =>
  typeof m === 'object' && m !== null && (m as { type?: unknown }).type === 'cap/joined-groups';

/** Background -> content script: read the group name from the loaded page. */
export interface GroupNameRequest {
  type: 'cap/group-name';
}

export interface GroupNameReply {
  name: string | null;
  /** Set when the page shows a checkpoint or block; the caller must stop. */
  fatal?: string;
}

/** UI -> background. */
export type RunCommand =
  | { type: 'cap/run/start'; campaignId: string }
  | { type: 'cap/run/pause' }
  | { type: 'cap/run/resume' }
  /** Continues a run the user stopped; groups already posted are skipped. */
  | { type: 'cap/run/continue' }
  | { type: 'cap/run/stop' }
  | { type: 'cap/run/reset' }
  /** Opens groups without a name one by one (read-only) and stores the names. */
  | { type: 'cap/run/fetch-names' }
  /** Reads the user's joined groups from facebook.com/groups/joins/ (read-only) into `joinedScanItem`. */
  | { type: 'cap/run/fetch-joined' }
  /** Asks GitHub for the latest release now, instead of waiting for the daily check. */
  | { type: 'cap/run/check-update' }
  /** Asks the optional updater helper whether it is installed and which version its folder holds (`updaterItem`). */
  | { type: 'cap/run/updater-status' }
  /** Asks the updater helper to install the latest release, then reloads CAP. Refused while a run is active. */
  | { type: 'cap/run/install-update' };

export interface CommandReply {
  ok: boolean;
  error?: string;
}

export type PostReply = PostOutcome;

export const isPostRequest = (m: unknown): m is PostRequest =>
  typeof m === 'object' && m !== null && (m as { type?: unknown }).type === 'cap/post';

export const isRunCommand = (m: unknown): m is RunCommand =>
  typeof m === 'object' &&
  m !== null &&
  typeof (m as { type?: unknown }).type === 'string' &&
  (m as { type: string }).type.startsWith('cap/run/');

export const isGroupNameRequest = (m: unknown): m is GroupNameRequest =>
  typeof m === 'object' && m !== null && (m as { type?: unknown }).type === 'cap/group-name';
