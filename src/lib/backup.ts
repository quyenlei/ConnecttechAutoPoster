import { clampDelay, recommendDelay } from './delay';
import { canonicalGroupUrl, parseGroupSlug } from './groups';
import { DEFAULT_SAFETY_BREAK, LIMITS } from './limits';
import { sanitizeImage, totalImageBytes } from './images';
import { normalizeTimes, validateTimes } from './schedule';
import type { Campaign, CampaignImage, CampaignSchedule, Group, LogEntry, LogStatus, SafetyBreak, Settings } from './types';

export const BACKUP_APP = 'connecttech-auto-poster';
export const BACKUP_FORMAT_VERSION = 1;
/** Room for the image limit (4 MB of images is about 5.4 MB as base64) plus everything else. */
export const MAX_BACKUP_BYTES = 8 * 1024 * 1024;

const MAX_NAME_LENGTH = 200;
const MAX_ID_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 1000;
const LOG_STATUSES: readonly LogStatus[] = ['posted', 'pending', 'failed', 'skipped', 'break', 'info'];
const DEFAULT_BACKUP_SETTINGS: Settings = { notifyOnFinish: false };

/** Only user data. Run state and re-run protection are technical state and never leave the device. */
export interface BackupData {
  groups: Group[];
  campaigns: Campaign[];
  settings: Settings;
  logs: LogEntry[];
}

export interface Backup {
  app: typeof BACKUP_APP;
  formatVersion: number;
  exportedAt: number;
  appVersion: string;
  data: BackupData;
}

export interface DroppedCounts {
  groups: number;
  campaigns: number;
  logs: number;
  /** Images left out because they were invalid or over a limit. */
  images: number;
}

export type ParseResult = { ok: true; backup: Backup; dropped: DroppedCounts } | { ok: false; error: string };

export interface ItemCounts {
  added: number;
  existing: number;
}

export interface ImportPreview {
  groups: ItemCounts;
  campaigns: ItemCounts;
  logs: ItemCounts;
  /** Imported campaigns whose schedule was on in the file and is now off. */
  schedulesTurnedOff: number;
  /** Images of new campaigns that did not fit the total image limit. */
  imagesDropped: number;
  /** False when the current settings were kept because they are not the defaults. */
  settingsApplied: boolean;
}

export interface ImportPlan {
  merged: BackupData;
  preview: ImportPreview;
}

export function buildBackup(data: BackupData, appVersion: string, now: number): Backup {
  return {
    app: BACKUP_APP,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now,
    appVersion,
    data: { groups: data.groups, campaigns: data.campaigns, settings: data.settings, logs: data.logs },
  };
}

// ---------------------------------------------------------------- parsing

type Obj = Record<string, unknown>;

const isObject = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value);
const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown, max: number): string | null => (typeof value === 'string' ? value.slice(0, max) : null);
const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
};
const hasOwn = (obj: Obj, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);
const own = (obj: Obj, key: string): unknown => (hasOwn(obj, key) ? obj[key] : undefined);

interface ParsedGroups {
  groups: Group[];
  /** File id -> slug id, so campaigns can follow a renamed group id. */
  idMap: Map<string, string>;
  dropped: number;
}

function parseGroups(raw: unknown[]): ParsedGroups {
  const groups: Group[] = [];
  const idMap = new Map<string, string>();
  const seen = new Set<string>();
  let dropped = 0;
  for (const item of raw) {
    const slug = isObject(item) && typeof item.url === 'string' ? parseGroupSlug(item.url) : null;
    if (!isObject(item) || !slug) {
      dropped++;
      continue;
    }
    if (typeof item.id === 'string') idMap.set(item.id, slug);
    if (seen.has(slug)) continue;
    seen.add(slug);
    groups.push({ id: slug, name: text(item.name, MAX_NAME_LENGTH)?.trim() || slug, url: canonicalGroupUrl(slug) });
  }
  return { groups, idMap, dropped };
}

function parseSchedule(raw: unknown): CampaignSchedule | undefined {
  if (!isObject(raw)) return undefined;
  const times = normalizeTimes(asList(raw.times).filter((t): t is string => typeof t === 'string'));
  return { enabled: raw.enabled === true, times: validateTimes(times) ? [] : times };
}

function parseSafetyBreak(raw: unknown): SafetyBreak {
  if (!isObject(raw)) return { ...DEFAULT_SAFETY_BREAK };
  return {
    enabled: raw.enabled !== false,
    everyPosts: clampInt(raw.everyPosts, 1, LIMITS.maxSafetyBreakEvery, DEFAULT_SAFETY_BREAK.everyPosts),
    breakMinutes: clampInt(raw.breakMinutes, 1, LIMITS.maxSafetyBreakMinutes, DEFAULT_SAFETY_BREAK.breakMinutes),
  };
}

function parseImages(raw: unknown): { images: CampaignImage[]; dropped: number } {
  const list = asList(raw);
  const images: CampaignImage[] = [];
  const seen = new Set<string>();
  for (const item of list.slice(0, LIMITS.maxImagesPerCampaign)) {
    const image = sanitizeImage(item);
    if (image && !seen.has(image.id)) {
      seen.add(image.id);
      images.push(image);
    }
  }
  return { images, dropped: list.length - images.length };
}

function parseCampaign(raw: unknown, idMap: Map<string, string>, fallbackTime: number): { campaign: Campaign; droppedImages: number } | null {
  if (!isObject(raw)) return null;
  const id = text(raw.id, MAX_ID_LENGTH);
  if (!id) return null;

  const groupIds = [...new Set(asList(raw.groupIds).filter((g): g is string => typeof g === 'string').map((g) => idMap.get(g) ?? g))].slice(
    0,
    LIMITS.maxGroupsPerCampaign,
  );
  const variations = asList(raw.variations)
    .filter((v): v is string => typeof v === 'string')
    .slice(0, LIMITS.maxVariations)
    .map((v) => v.slice(0, LIMITS.maxPostLength));
  const delay = isObject(raw.delay)
    ? clampDelay({ minSec: Number(raw.delay.minSec), maxSec: Number(raw.delay.maxSec) })
    : recommendDelay(groupIds.length);

  const campaign: Campaign = {
    id,
    name: text(raw.name, MAX_NAME_LENGTH)?.trim() || 'Chiến dịch đã nhập',
    variations: variations.length > 0 ? variations : [''],
    groupIds,
    delay,
    safetyBreak: parseSafetyBreak(raw.safetyBreak),
    createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : fallbackTime,
  };
  if (raw.mode === 'comment') {
    campaign.mode = 'comment';
    campaign.commentsPerGroup = clampInt(raw.commentsPerGroup, 1, LIMITS.maxCommentsPerGroup, 1);
  }
  const schedule = parseSchedule(raw.schedule);
  if (schedule) campaign.schedule = schedule;

  // Images and the link preview option belong to post campaigns only.
  let droppedImages = 0;
  if (campaign.mode === 'comment') {
    droppedImages = asList(raw.images).length;
  } else {
    const parsed = parseImages(raw.images);
    droppedImages = parsed.dropped;
    if (parsed.images.length > 0) campaign.images = parsed.images;
    if (raw.removeLinkPreview === true) campaign.removeLinkPreview = true;
  }
  return { campaign, droppedImages };
}

function parseLog(raw: unknown): LogEntry | null {
  if (!isObject(raw)) return null;
  const id = text(raw.id, MAX_ID_LENGTH);
  if (!id || typeof raw.ts !== 'number' || !Number.isFinite(raw.ts)) return null;
  const status = LOG_STATUSES.find((s) => s === raw.status);
  if (!status) return null;
  return {
    id,
    ts: raw.ts,
    campaignId: text(raw.campaignId, MAX_ID_LENGTH) ?? '',
    groupId: text(raw.groupId, MAX_ID_LENGTH) ?? '',
    groupName: text(raw.groupName, MAX_NAME_LENGTH) ?? '',
    status,
    message: text(raw.message, MAX_MESSAGE_LENGTH) ?? '',
  };
}

/** Validates a backup file. Invalid items are dropped and counted; the file is only refused when it is unusable. */
export function parseBackup(source: string): ParseResult {
  if (new TextEncoder().encode(source).length > MAX_BACKUP_BYTES) {
    return { ok: false, error: `File quá lớn. Giới hạn là ${MAX_BACKUP_BYTES / 1024 / 1024} MB.` };
  }
  let root: unknown;
  try {
    root = JSON.parse(source);
  } catch {
    return { ok: false, error: 'File không phải JSON hợp lệ.' };
  }
  if (!isObject(root) || root.app !== BACKUP_APP) {
    return { ok: false, error: 'Đây không phải file sao lưu của Connecttech Auto Poster.' };
  }
  if (typeof root.formatVersion !== 'number' || !Number.isInteger(root.formatVersion) || root.formatVersion < 1) {
    return { ok: false, error: 'File sao lưu thiếu phiên bản định dạng.' };
  }
  if (root.formatVersion > BACKUP_FORMAT_VERSION) {
    return { ok: false, error: 'File sao lưu được tạo bởi phiên bản mới hơn. Hãy cập nhật extension trước khi nhập.' };
  }
  if (!isObject(root.data)) return { ok: false, error: 'File sao lưu không có dữ liệu.' };

  const exportedAt = typeof root.exportedAt === 'number' && Number.isFinite(root.exportedAt) ? root.exportedAt : 0;
  const rawGroups = asList(own(root.data, 'groups'));
  const rawCampaigns = asList(own(root.data, 'campaigns'));
  const rawLogs = asList(own(root.data, 'logs'));

  const { groups, idMap, dropped: droppedGroups } = parseGroups(rawGroups);
  const campaigns: Campaign[] = [];
  const campaignIds = new Set<string>();
  let droppedImages = 0;
  for (const raw of rawCampaigns) {
    const parsed = parseCampaign(raw, idMap, exportedAt);
    if (parsed && !campaignIds.has(parsed.campaign.id)) {
      campaignIds.add(parsed.campaign.id);
      campaigns.push(parsed.campaign);
      droppedImages += parsed.droppedImages;
    }
  }
  const logs: LogEntry[] = [];
  const logIds = new Set<string>();
  for (const raw of rawLogs) {
    const entry = parseLog(raw);
    if (entry && !logIds.has(entry.id)) {
      logIds.add(entry.id);
      logs.push(entry);
    }
  }

  const rawSettings = own(root.data, 'settings');
  const settings: Settings = { notifyOnFinish: isObject(rawSettings) && rawSettings.notifyOnFinish === true };

  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      formatVersion: root.formatVersion,
      exportedAt,
      appVersion: text(root.appVersion, 50) ?? '',
      data: { groups, campaigns, settings, logs },
    },
    dropped: {
      groups: droppedGroups,
      campaigns: rawCampaigns.length - campaigns.length,
      logs: rawLogs.length - logs.length,
      images: droppedImages,
    },
  };
}

// ---------------------------------------------------------------- merging

const isDefaultSettings = (settings: Settings): boolean => settings.notifyOnFinish === DEFAULT_BACKUP_SETTINGS.notifyOnFinish;

/**
 * Merges a parsed backup into the current data without deleting anything.
 * Existing items always win, and every imported schedule is switched off.
 */
export function planImport(current: BackupData, backup: Backup): ImportPlan {
  // Groups: match by id, then by canonical url.
  const groups = [...current.groups];
  const groupIds = new Set(groups.map((g) => g.id));
  const idByUrl = new Map(groups.map((g) => [g.url, g.id]));
  const remap = new Map<string, string>();
  let groupsAdded = 0;
  let groupsExisting = 0;
  for (const group of backup.data.groups) {
    const existingId = groupIds.has(group.id) ? group.id : idByUrl.get(group.url);
    if (existingId !== undefined) {
      remap.set(group.id, existingId);
      groupsExisting++;
      continue;
    }
    groups.push(group);
    groupIds.add(group.id);
    idByUrl.set(group.url, group.id);
    groupsAdded++;
  }

  // Campaigns: existing id wins. New ones keep only groups that exist after the merge.
  const campaigns = [...current.campaigns];
  const campaignIds = new Set(campaigns.map((c) => c.id));
  let campaignsAdded = 0;
  let campaignsExisting = 0;
  let schedulesTurnedOff = 0;
  let imagesDropped = 0;
  let imageBytes = campaigns.reduce((sum, c) => sum + totalImageBytes(c.images ?? []), 0);
  for (const campaign of backup.data.campaigns) {
    if (campaignIds.has(campaign.id)) {
      campaignsExisting++;
      continue;
    }
    const imported: Campaign = {
      ...campaign,
      groupIds: [...new Set(campaign.groupIds.map((id) => remap.get(id) ?? id).filter((id) => groupIds.has(id)))],
    };
    if (campaign.images) {
      // Images that would push the total over the limit are left out, never the whole campaign.
      const fits = campaign.images.filter((image) => (imageBytes + image.bytes <= LIMITS.maxTotalImageBytes ? ((imageBytes += image.bytes), true) : false));
      imagesDropped += campaign.images.length - fits.length;
      if (fits.length > 0) imported.images = fits;
      else delete imported.images;
    }
    if (campaign.schedule) {
      if (campaign.schedule.enabled) schedulesTurnedOff++;
      imported.schedule = { enabled: false, times: [...campaign.schedule.times] };
    }
    campaigns.push(imported);
    campaignIds.add(imported.id);
    campaignsAdded++;
  }

  // Logs: merge by id, oldest first, keep the newest entries.
  const logIds = new Set(current.logs.map((l) => l.id));
  const newLogs = backup.data.logs.filter((l) => !logIds.has(l.id));
  const logs = [...current.logs, ...newLogs].sort((a, b) => a.ts - b.ts).slice(-LIMITS.maxLogEntries);

  const settingsApplied = isDefaultSettings(current.settings);

  return {
    merged: { groups, campaigns, settings: settingsApplied ? { ...backup.data.settings } : current.settings, logs },
    preview: {
      groups: { added: groupsAdded, existing: groupsExisting },
      campaigns: { added: campaignsAdded, existing: campaignsExisting },
      logs: { added: newLogs.length, existing: backup.data.logs.length - newLogs.length },
      schedulesTurnedOff,
      imagesDropped,
      settingsApplied,
    },
  };
}
