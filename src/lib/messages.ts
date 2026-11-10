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

export interface DiscoverRequest {
  type: 'cap/discover-posts';
  groupId: string;
}

export interface DiscoverReply {
  urls: string[];
  diagnostic?: string;
  problem?: { kind: 'fatal' | 'skipped' | 'failed'; reason: string };
}

/** Newest-posts mode: pick one of the first feed posts of the open group page, then comment on it. */
export interface FeedPickRequest {
  type: 'cap/feed-pick';
  /** Fingerprints (see `postFingerprint`) already tried. */
  skip: string[];
}

export interface FeedPickReply {
  fingerprint?: string;
  diagnostic?: string;
  problem?: { kind: 'fatal' | 'skipped' | 'failed'; reason: string };
}

export interface FeedCommentRequest {
  type: 'cap/feed-comment';
  text: string;
}

export const isFeedPickRequest = (m: unknown): m is FeedPickRequest =>
  typeof m === 'object' && m !== null && (m as { type?: unknown }).type === 'cap/feed-pick' && Array.isArray((m as { skip?: unknown }).skip) && (m as { skip: unknown[] }).skip.every((v) => typeof v === 'string');

export const isFeedCommentRequest = (m: unknown): m is FeedCommentRequest =>
  typeof m === 'object' && m !== null && (m as { type?: unknown }).type === 'cap/feed-comment' && typeof (m as { text?: unknown }).text === 'string';

export interface CommentRequest {
  type: 'cap/comment';
  text: string;
}

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
  | { type: 'cap/run/fetch-names' };

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
