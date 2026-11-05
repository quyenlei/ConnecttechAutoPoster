import type { PostOutcome } from './types';

/** Background -> content script (group page). */
export interface PostRequest {
  type: 'cap/post';
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
