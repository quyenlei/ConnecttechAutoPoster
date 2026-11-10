import { storage } from 'wxt/utils/storage';
import { LIMITS } from './limits';
import type { BackupData } from './backup';
import { IDLE_RUN, isActive } from './run-engine';
import type { Campaign, CommentTab, Group, JoinedScan, LogEntry, RunState, Settings } from './types';

/** All data stays in chrome.storage.local on this device. Nothing is sent anywhere. */
export const groupsItem = storage.defineItem<Group[]>('local:groups', { fallback: [] });
export const campaignsItem = storage.defineItem<Campaign[]>('local:campaigns', { fallback: [] });
export const logsItem = storage.defineItem<LogEntry[]>('local:logs', { fallback: [] });
export const runItem = storage.defineItem<RunState>('local:run', { fallback: IDLE_RUN });
export const DEFAULT_SETTINGS: Settings = { notifyOnFinish: false };
export const settingsItem = storage.defineItem<Settings>('local:settings', { fallback: DEFAULT_SETTINGS });
/** Reserved before submitting so an interrupted run cannot retry the same post. */
export const commentedPostsItem = storage.defineItem<Record<string, number>>('local:commentedPosts', { fallback: {} });
/** Window of the running comment campaign. Never exported in a backup. */
export const commentTabItem = storage.defineItem<CommentTab | null>('local:commentTab', { fallback: null });
/** Preview of the user's joined groups. Never exported in a backup. */
export const joinedScanItem = storage.defineItem<JoinedScan | null>('local:joinedScan', { fallback: null });
/** Epoch ms of the last time due schedule slots were processed. */
export const scheduleCheckItem = storage.defineItem<number | null>('local:scheduleCheck', { fallback: null });

export async function appendLog(entry: LogEntry): Promise<void> {
  const logs = await logsItem.getValue();
  await logsItem.setValue([...logs, entry].slice(-LIMITS.maxLogEntries));
}

/** Everything a backup contains. Run state and re-run protection are deliberately left out. */
export async function readBackupData(): Promise<BackupData> {
  const [groups, campaigns, settings, logs] = await Promise.all([
    groupsItem.getValue(),
    campaignsItem.getValue(),
    settingsItem.getValue(),
    logsItem.getValue(),
  ]);
  return { groups, campaigns, settings, logs };
}

export type ImportResult = { ok: true } | { ok: false; error: string };

/** Writes merged data. Refuses while a run is active, checked right before writing. */
export async function writeImportedData(merged: BackupData): Promise<ImportResult> {
  if (isActive(await runItem.getValue())) {
    return { ok: false, error: 'Đang có lượt chạy. Hãy dừng hoặc chờ lượt chạy xong trước khi nhập.' };
  }
  await Promise.all([
    groupsItem.setValue(merged.groups),
    campaignsItem.setValue(merged.campaigns),
    settingsItem.setValue(merged.settings),
    logsItem.setValue(merged.logs),
  ]);
  return { ok: true };
}
