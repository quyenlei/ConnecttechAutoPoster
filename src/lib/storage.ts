import { storage } from 'wxt/utils/storage';
import { IDLE_RUN } from './run-engine';
import type { Campaign, Group, LogEntry, RunState } from './types';

/** All data stays in chrome.storage.local on this device. Nothing is sent anywhere. */
export const groupsItem = storage.defineItem<Group[]>('local:groups', { fallback: [] });
export const campaignsItem = storage.defineItem<Campaign[]>('local:campaigns', { fallback: [] });
export const logsItem = storage.defineItem<LogEntry[]>('local:logs', { fallback: [] });
export const runItem = storage.defineItem<RunState>('local:run', { fallback: IDLE_RUN });
/** Reserved before submitting so an interrupted run cannot retry the same post. */
export const commentedPostsItem = storage.defineItem<Record<string, number>>('local:commentedPosts', { fallback: {} });
/** Epoch ms of the last time due schedule slots were processed. */
export const scheduleCheckItem = storage.defineItem<number | null>('local:scheduleCheck', { fallback: null });

const MAX_LOGS = 2000;

export async function appendLog(entry: LogEntry): Promise<void> {
  const logs = await logsItem.getValue();
  await logsItem.setValue([...logs, entry].slice(-MAX_LOGS));
}
