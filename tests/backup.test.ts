import { describe, expect, it } from 'vitest';
import { BACKUP_APP, BACKUP_FORMAT_VERSION, buildBackup, MAX_BACKUP_BYTES, parseBackup, planImport, type BackupData } from '../src/lib/backup';
import { LIMITS } from '../src/lib/limits';
import type { Campaign, CampaignImage, Group, LogEntry } from '../src/lib/types';

const NOW = 1_731_120_000_000;
const group = (slug: string, name = slug): Group => ({ id: slug, name, url: `https://www.facebook.com/groups/${slug}/` });
const campaign = (over: Partial<Campaign> = {}): Campaign => ({
  id: 'c1',
  name: 'Chiến dịch 1',
  variations: ['Xin chào'],
  groupIds: ['alpha'],
  delay: { minSec: 90, maxSec: 180 },
  safetyBreak: { enabled: true, everyPosts: 10, breakMinutes: 15 },
  createdAt: 1,
  ...over,
});
const log = (id: string, ts: number): LogEntry => ({ id, ts, campaignId: 'c1', groupId: 'alpha', groupName: 'Alpha', status: 'posted', message: 'ok' });
const empty = (): BackupData => ({ groups: [], campaigns: [], settings: { notifyOnFinish: false }, logs: [] });
const sample = (): BackupData => ({
  groups: [group('alpha', 'Alpha'), group('beta', 'Beta')],
  campaigns: [campaign({ groupIds: ['alpha', 'beta'], schedule: { enabled: true, times: ['07:00', '13:00'] } })],
  settings: { notifyOnFinish: true },
  logs: [log('l1', 10), log('l2', 20)],
});
const parseOk = (value: unknown) => {
  const result = parseBackup(JSON.stringify(value));
  if (!result.ok) throw new Error(result.error);
  return result;
};
const wrap = (data: unknown) => ({ app: BACKUP_APP, formatVersion: BACKUP_FORMAT_VERSION, exportedAt: NOW, appVersion: '0.2.18', data });

describe('buildBackup', () => {
  it('wraps the data with the format header', () => {
    const backup = buildBackup(sample(), '0.2.18', NOW);
    expect(backup).toMatchObject({ app: BACKUP_APP, formatVersion: 1, exportedAt: NOW, appVersion: '0.2.18' });
    expect(backup.data.groups).toHaveLength(2);
  });

  it('never carries run state or re-run protection data', () => {
    const backup = buildBackup(sample(), '0.2.18', NOW);
    expect(Object.keys(backup.data).sort()).toEqual(['campaigns', 'groups', 'logs', 'settings']);
  });
});

describe('parseBackup: file level', () => {
  it('round-trips a built backup', () => {
    const data = sample();
    const result = parseOk(buildBackup(data, '0.2.18', NOW));
    expect(result.backup.data).toEqual(data);
    expect(result.dropped).toEqual({ groups: 0, campaigns: 0, logs: 0, images: 0 });
  });

  it('rejects broken JSON', () => {
    const result = parseBackup('{not json');
    expect(result.ok).toBe(false);
  });

  it('rejects a file from another app', () => {
    const result = parseBackup(JSON.stringify({ ...wrap({}), app: 'other' }));
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects a newer format version', () => {
    const result = parseBackup(JSON.stringify({ ...wrap({}), formatVersion: BACKUP_FORMAT_VERSION + 1 }));
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/mới hơn/);
  });

  it('rejects a file that is not an object or has no data', () => {
    expect(parseBackup('[]').ok).toBe(false);
    expect(parseBackup('null').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ ...wrap({}), data: null })).ok).toBe(false);
  });

  it('rejects a file over 8 MB', () => {
    const result = parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1));
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/8 MB/);
  });

  it('treats missing lists as empty', () => {
    const result = parseOk(wrap({}));
    expect(result.backup.data).toEqual(empty());
  });
});

describe('parseBackup: groups', () => {
  it('drops entries that are not Facebook groups and counts them', () => {
    const result = parseOk(wrap({
      groups: [group('alpha'), { id: 'x', name: 'Bad', url: 'https://example.com/groups/x/' }, 'text', null, { id: 1 }],
    }));
    expect(result.backup.data.groups.map((g) => g.id)).toEqual(['alpha']);
    expect(result.dropped.groups).toBe(4);
  });

  it('rebuilds the canonical url and uses the slug as id', () => {
    const result = parseOk(wrap({ groups: [{ id: 'old-id', name: 'Beta', url: 'https://m.facebook.com/groups/beta?x=1' }] }));
    expect(result.backup.data.groups).toEqual([group('beta', 'Beta')]);
  });

  it('remaps campaign group ids when the file id differs from the slug', () => {
    const result = parseOk(wrap({
      groups: [{ id: 'old-id', name: 'Beta', url: 'https://www.facebook.com/groups/beta/' }],
      campaigns: [campaign({ groupIds: ['old-id'] })],
    }));
    expect(result.backup.data.campaigns[0]?.groupIds).toEqual(['beta']);
  });

  it('falls back to the slug for a missing or non-string name and ignores duplicates', () => {
    const result = parseOk(wrap({ groups: [{ id: 'a', url: group('alpha').url }, group('alpha', 'Again')] }));
    expect(result.backup.data.groups).toEqual([group('alpha', 'alpha')]);
  });
});

describe('parseBackup: campaigns', () => {
  it('drops campaigns without an id and counts them', () => {
    const result = parseOk(wrap({ campaigns: [campaign(), { name: 'x' }, 5] }));
    expect(result.backup.data.campaigns).toHaveLength(1);
    expect(result.dropped.campaigns).toBe(2);
  });

  it('raises a delay below the hard minimum', () => {
    const result = parseOk(wrap({ campaigns: [campaign({ delay: { minSec: 1, maxSec: 2 } })] }));
    expect(result.backup.data.campaigns[0]?.delay).toEqual({ minSec: LIMITS.minDelaySec, maxSec: LIMITS.minDelaySec });
  });

  it('caps a delay above the hard maximum', () => {
    const result = parseOk(wrap({ campaigns: [campaign({ delay: { minSec: 999999, maxSec: 9999999 } })] }));
    expect(result.backup.data.campaigns[0]?.delay).toEqual({ minSec: LIMITS.maxDelaySec, maxSec: LIMITS.maxDelaySec });
  });

  it('uses a safe default delay when it is missing', () => {
    const { delay: _delay, ...rest } = campaign();
    const result = parseOk(wrap({ campaigns: [rest] }));
    expect(result.backup.data.campaigns[0]?.delay.minSec).toBeGreaterThanOrEqual(LIMITS.minDelaySec);
  });

  it('limits the number of variations', () => {
    const variations = Array.from({ length: LIMITS.maxVariations + 5 }, (_, i) => `v${i}`);
    const result = parseOk(wrap({ campaigns: [campaign({ variations })] }));
    expect(result.backup.data.campaigns[0]?.variations).toHaveLength(LIMITS.maxVariations);
  });

  it('truncates an over-long variation and ignores non-string ones', () => {
    const result = parseOk(wrap({ campaigns: [campaign({ variations: ['x'.repeat(LIMITS.maxPostLength + 50), 7 as unknown as string] })] }));
    const variations = result.backup.data.campaigns[0]?.variations ?? [];
    expect(variations).toHaveLength(1);
    expect(variations[0]).toHaveLength(LIMITS.maxPostLength);
  });

  it('keeps one empty variation when none is usable', () => {
    const result = parseOk(wrap({ campaigns: [campaign({ variations: [] })] }));
    expect(result.backup.data.campaigns[0]?.variations).toEqual(['']);
  });

  it('limits groups per campaign and removes duplicate ids', () => {
    const groupIds = Array.from({ length: LIMITS.maxGroupsPerCampaign + 10 }, (_, i) => `g${i}`).concat('g0');
    const result = parseOk(wrap({ campaigns: [campaign({ groupIds })] }));
    expect(result.backup.data.campaigns[0]?.groupIds).toHaveLength(LIMITS.maxGroupsPerCampaign);
  });

  it('clamps comment timing to the comment limits and post timing to the post limits', () => {
    const comment = parseOk(wrap({ campaigns: [campaign({ mode: 'comment', commentsPerGroup: 3, delay: { minSec: 0, maxSec: 4 }, groupBreak: { minSec: 1, maxSec: 99999 } })] }));
    expect(comment.backup.data.campaigns[0]).toMatchObject({ delay: { minSec: LIMITS.minCommentDelaySec, maxSec: 4 }, groupBreak: { minSec: LIMITS.minGroupBreakSec, maxSec: LIMITS.maxGroupBreakSec } });
    const post = parseOk(wrap({ campaigns: [campaign({ delay: { minSec: 2, maxSec: 4 }, groupBreak: { minSec: 10, maxSec: 20 } })] }));
    expect(post.backup.data.campaigns[0]?.delay).toEqual({ minSec: LIMITS.minDelaySec, maxSec: LIMITS.minDelaySec });
    expect(post.backup.data.campaigns[0]).not.toHaveProperty('groupBreak');
  });

  it('clamps comments per group for comment campaigns', () => {
    const high = parseOk(wrap({ campaigns: [campaign({ mode: 'comment', commentsPerGroup: 9999 })] }));
    expect(high.backup.data.campaigns[0]).toMatchObject({ mode: 'comment', commentsPerGroup: LIMITS.maxCommentsPerGroup });
    const newest = parseOk(wrap({ campaigns: [campaign({ mode: 'comment', commentsPerGroup: 50, commentNewestPosts: true })] }));
    expect(newest.backup.data.campaigns[0]).toMatchObject({ commentNewestPosts: true, commentsPerGroup: LIMITS.maxNewestPostComments });
    const notComment = parseOk(wrap({ campaigns: [campaign({ commentNewestPosts: true })] }));
    expect(notComment.backup.data.campaigns[0]).not.toHaveProperty('commentNewestPosts');
    const low = parseOk(wrap({ campaigns: [campaign({ mode: 'comment', commentsPerGroup: 0 })] }));
    expect(low.backup.data.campaigns[0]?.commentsPerGroup).toBe(1);
  });

  it('treats an unknown mode as a post campaign', () => {
    const result = parseOk(wrap({ campaigns: [campaign({ mode: 'weird' as never })] }));
    expect(result.backup.data.campaigns[0]?.mode).toBeUndefined();
  });

  it('clamps the Safety Break values', () => {
    const result = parseOk(wrap({ campaigns: [campaign({ safetyBreak: { enabled: true, everyPosts: 0, breakMinutes: 99999 } })] }));
    expect(result.backup.data.campaigns[0]?.safetyBreak).toEqual({ enabled: true, everyPosts: 1, breakMinutes: LIMITS.maxSafetyBreakMinutes });
  });

  it('keeps valid schedule times and clears times that break the limits', () => {
    const ok = parseOk(wrap({ campaigns: [campaign({ schedule: { enabled: true, times: ['13:00', '07:00', '07:00', 'zz'] } })] }));
    expect(ok.backup.data.campaigns[0]?.schedule).toEqual({ enabled: true, times: ['07:00', '13:00'] });
    const tooClose = parseOk(wrap({ campaigns: [campaign({ schedule: { enabled: true, times: ['07:00', '12:00'] } })] }));
    expect(tooClose.backup.data.campaigns[0]?.schedule).toEqual({ enabled: true, times: [] });
    const tooMany = parseOk(wrap({ campaigns: [campaign({ schedule: { enabled: true, times: ['01:00', '08:00', '15:00'] } })] }));
    expect(tooMany.backup.data.campaigns[0]?.schedule?.times).toEqual([]);
  });

  it('ignores unknown and prototype-polluting keys', () => {
    const text = '{"app":"connecttech-auto-poster","formatVersion":1,"data":{"campaigns":[{"id":"c9","name":"N","variations":["a"],"groupIds":[],"__proto__":{"polluted":true},"evil":"x"}]}}';
    const result = parseBackup(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const imported = result.backup.data.campaigns[0] as unknown as Record<string, unknown>;
    expect(imported.evil).toBeUndefined();
    expect(Object.keys(imported)).not.toContain('__proto__');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('parseBackup: logs and settings', () => {
  it('keeps valid log entries, drops broken ones and unknown statuses', () => {
    const result = parseOk(wrap({ logs: [log('l1', 5), { id: 'l2' }, { ...log('l3', 6), status: 'hacked' }, null] }));
    expect(result.backup.data.logs.map((l) => l.id)).toEqual(['l1']);
    expect(result.dropped.logs).toBe(3);
  });

  it('keeps only the notification setting as a boolean', () => {
    expect(parseOk(wrap({ settings: { notifyOnFinish: true, extra: 1 } })).backup.data.settings).toEqual({ notifyOnFinish: true });
    expect(parseOk(wrap({ settings: { notifyOnFinish: 'yes' } })).backup.data.settings).toEqual({ notifyOnFinish: false });
  });
});

describe('planImport', () => {
  const backupOf = (data: BackupData) => parseOk(buildBackup(data, '0.2.18', NOW)).backup;

  it('adds everything to an empty profile', () => {
    const { merged, preview } = planImport(empty(), backupOf(sample()));
    expect(merged.groups).toHaveLength(2);
    expect(merged.campaigns).toHaveLength(1);
    expect(merged.logs).toHaveLength(2);
    expect(preview.groups).toEqual({ added: 2, existing: 0 });
    expect(preview.campaigns).toEqual({ added: 1, existing: 0 });
    expect(preview.logs).toEqual({ added: 2, existing: 0 });
  });

  it('switches every imported schedule off, keeps the times and counts them', () => {
    const { merged, preview } = planImport(empty(), backupOf(sample()));
    expect(merged.campaigns[0]?.schedule).toEqual({ enabled: false, times: ['07:00', '13:00'] });
    expect(preview.schedulesTurnedOff).toBe(1);
  });

  it('does not count a schedule that was already off', () => {
    const data = sample();
    data.campaigns = [campaign({ schedule: { enabled: false, times: ['07:00'] } })];
    expect(planImport(empty(), backupOf(data)).preview.schedulesTurnedOff).toBe(0);
  });

  it('keeps the current item when an id already exists', () => {
    const current = { ...empty(), groups: [group('alpha', 'Tên của tôi')], campaigns: [campaign({ name: 'Bản hiện tại' })] };
    const { merged, preview } = planImport(current, backupOf(sample()));
    expect(merged.groups.find((g) => g.id === 'alpha')?.name).toBe('Tên của tôi');
    expect(merged.campaigns).toHaveLength(1);
    expect(merged.campaigns[0]?.name).toBe('Bản hiện tại');
    expect(preview.groups).toEqual({ added: 1, existing: 1 });
    expect(preview.campaigns).toEqual({ added: 0, existing: 1 });
  });

  it('never changes the schedule of a campaign that already exists', () => {
    const current = { ...empty(), groups: [group('alpha')], campaigns: [campaign({ schedule: { enabled: true, times: ['09:00'] } })] };
    const { merged } = planImport(current, backupOf(sample()));
    expect(merged.campaigns[0]?.schedule).toEqual({ enabled: true, times: ['09:00'] });
  });

  it('maps a group already present under another id by url', () => {
    const current = { ...empty(), groups: [{ id: 'legacy', name: 'Alpha cũ', url: group('alpha').url }] };
    const { merged, preview } = planImport(current, backupOf(sample()));
    expect(merged.groups.filter((g) => g.url === group('alpha').url)).toHaveLength(1);
    expect(merged.campaigns[0]?.groupIds).toEqual(['legacy', 'beta']);
    expect(preview.groups).toEqual({ added: 1, existing: 1 });
  });

  it('drops campaign group ids that match no group after the merge', () => {
    const data = sample();
    data.campaigns = [campaign({ groupIds: ['alpha', 'ghost'] })];
    const { merged } = planImport(empty(), backupOf(data));
    expect(merged.campaigns[0]?.groupIds).toEqual(['alpha']);
  });

  it('keeps the groups of existing profile when a campaign references them', () => {
    const data = sample();
    data.groups = [];
    data.campaigns = [campaign({ groupIds: ['alpha'] })];
    const current = { ...empty(), groups: [group('alpha')] };
    expect(planImport(current, backupOf(data)).merged.campaigns[0]?.groupIds).toEqual(['alpha']);
  });

  it('merges logs by id, sorts by time and keeps the newest within the cap', () => {
    const current = { ...empty(), logs: [log('l2', 20), log('l9', 5)] };
    const { merged, preview } = planImport(current, backupOf(sample()));
    expect(merged.logs.map((l) => l.id)).toEqual(['l9', 'l1', 'l2']);
    expect(preview.logs).toEqual({ added: 1, existing: 1 });

    const many = Array.from({ length: LIMITS.maxLogEntries }, (_, i) => log(`m${i}`, 1000 + i));
    const trimmed = planImport({ ...empty(), logs: many }, backupOf(sample()));
    expect(trimmed.merged.logs).toHaveLength(LIMITS.maxLogEntries);
    expect(trimmed.merged.logs.at(-1)?.id).toBe(`m${LIMITS.maxLogEntries - 1}`);
    expect(trimmed.merged.logs.some((l) => l.id === 'l1')).toBe(false);
  });

  it('applies file settings only when the current settings are the defaults', () => {
    const fromDefault = planImport(empty(), backupOf(sample()));
    expect(fromDefault.merged.settings).toEqual({ notifyOnFinish: true });
    expect(fromDefault.preview.settingsApplied).toBe(true);

    const current = { ...empty(), settings: { notifyOnFinish: true } };
    const data = sample();
    data.settings = { notifyOnFinish: false };
    const kept = planImport(current, backupOf(data));
    expect(kept.merged.settings).toEqual({ notifyOnFinish: true });
    expect(kept.preview.settingsApplied).toBe(false);
  });

  it('is idempotent: importing the same file twice adds nothing the second time', () => {
    const backup = backupOf(sample());
    const first = planImport(empty(), backup);
    const second = planImport(first.merged, backup);
    expect(second.merged).toEqual(first.merged);
    expect(second.preview.groups.added + second.preview.campaigns.added + second.preview.logs.added).toBe(0);
  });

  it('does not mutate the current data', () => {
    const current = { ...empty(), groups: [group('alpha')] };
    const snapshot = JSON.stringify(current);
    planImport(current, backupOf(sample()));
    expect(JSON.stringify(current)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------- v0.5 content fields

const b64 = (n: number) => Buffer.alloc(n, 1).toString('base64');
const img = (id: string, size = 100, over: Partial<CampaignImage> = {}): CampaignImage => ({
  id,
  name: `${id}.png`,
  mime: 'image/png',
  dataUrl: `data:image/png;base64,${b64(size)}`,
  bytes: size,
  ...over,
});
const roundTrip = (data: BackupData) => parseOk(JSON.parse(JSON.stringify(buildBackup(data, '0.5.0', NOW))));

describe('backup: {group} placeholder', () => {
  it('keeps placeholders exactly as typed through export and import', () => {
    const text = 'Xin chào {group}! { Group } {foo}';
    const data: BackupData = { ...empty(), groups: [group('alpha')], campaigns: [campaign({ variations: [text, 'B {group}'] })] };
    const result = roundTrip(data);
    expect(result.backup.data.campaigns[0]?.variations).toEqual([text, 'B {group}']);
    const plan = planImport(empty(), result.backup);
    expect(plan.merged.campaigns[0]?.variations[0]).toBe(text);
  });
});

describe('backup: link preview option', () => {
  it('keeps removeLinkPreview when on and leaves it out otherwise', () => {
    const on = roundTrip({ ...empty(), campaigns: [campaign({ removeLinkPreview: true })] });
    expect(on.backup.data.campaigns[0]?.removeLinkPreview).toBe(true);
    const off = roundTrip({ ...empty(), campaigns: [campaign({ removeLinkPreview: false }), campaign({ id: 'c2' })] });
    expect(off.backup.data.campaigns.every((c) => c.removeLinkPreview === undefined)).toBe(true);
  });
  it('treats non-boolean values as off', () => {
    const result = parseOk(wrap({ campaigns: [{ ...campaign(), removeLinkPreview: 'yes' }] }));
    expect(result.backup.data.campaigns[0]?.removeLinkPreview).toBeUndefined();
  });
  it('is not applied to comment campaigns', () => {
    const result = parseOk(wrap({ campaigns: [{ ...campaign(), mode: 'comment', commentsPerGroup: 2, removeLinkPreview: true }] }));
    expect(result.backup.data.campaigns[0]?.removeLinkPreview).toBeUndefined();
  });
});

describe('backup: images', () => {
  it('exports images with the campaign and imports them back unchanged', () => {
    const images = [img('a'), img('b', 50)];
    const result = roundTrip({ ...empty(), groups: [group('alpha')], campaigns: [campaign({ images })] });
    expect(result.backup.data.campaigns[0]?.images).toEqual(images);
    expect(result.dropped.images).toBe(0);
  });
  it('leaves old campaigns without images unchanged', () => {
    const result = roundTrip({ ...empty(), campaigns: [campaign()] });
    expect(result.backup.data.campaigns[0]).not.toHaveProperty('images');
  });
  it('drops invalid images and counts them', () => {
    const bad = [
      img('type', 10, { mime: 'image/gif' as never, dataUrl: `data:image/gif;base64,${b64(10)}` }),
      img('url', 10, { dataUrl: 'https://example.com/x.png' }),
      img('big', LIMITS.maxImageBytes + 1),
      img('ok'),
    ];
    const result = parseOk(wrap({ campaigns: [{ ...campaign(), images: bad }] }));
    expect(result.backup.data.campaigns[0]?.images?.map((i) => i.id)).toEqual(['ok']);
    expect(result.dropped.images).toBe(3);
  });
  it('recomputes the size instead of trusting the file', () => {
    const result = parseOk(wrap({ campaigns: [{ ...campaign(), images: [img('a', 100, { bytes: 1 })] }] }));
    expect(result.backup.data.campaigns[0]?.images?.[0]?.bytes).toBe(100);
  });
  it('keeps at most the per-campaign image count', () => {
    const many = Array.from({ length: LIMITS.maxImagesPerCampaign + 2 }, (_, i) => img(`i${i}`));
    const result = parseOk(wrap({ campaigns: [{ ...campaign(), images: many }] }));
    expect(result.backup.data.campaigns[0]?.images).toHaveLength(LIMITS.maxImagesPerCampaign);
    expect(result.dropped.images).toBe(2);
  });
  it('ignores images on comment campaigns', () => {
    const result = parseOk(wrap({ campaigns: [{ ...campaign(), mode: 'comment', commentsPerGroup: 2, images: [img('a')] }] }));
    expect(result.backup.data.campaigns[0]).not.toHaveProperty('images');
    expect(result.dropped.images).toBe(1);
  });
  it('enforces the total across campaigns when merging', () => {
    const big = LIMITS.maxImageBytes;
    const current: BackupData = { ...empty(), groups: [group('alpha')], campaigns: [campaign({ id: 'old', images: [img('o1', big), img('o2', big), img('o3', big)] })] };
    const incoming = roundTrip({ ...empty(), groups: [group('alpha')], campaigns: [campaign({ id: 'new', images: [img('n1', big), img('n2', big)] })] });
    const plan = planImport(current, incoming.backup);
    const added = plan.merged.campaigns.find((c) => c.id === 'new');
    expect(added?.images?.map((i) => i.id)).toEqual(['n1']);
    expect(plan.preview.imagesDropped).toBe(1);
  });
  it('accepts images up to exactly the total limit', () => {
    const big = LIMITS.maxImageBytes;
    const incoming = roundTrip({ ...empty(), groups: [group('alpha')], campaigns: [campaign({ images: Array.from({ length: 4 }, (_, i) => img(`i${i}`, big)) })] });
    const plan = planImport(empty(), incoming.backup);
    expect(plan.merged.campaigns[0]?.images).toHaveLength(4);
    expect(plan.preview.imagesDropped).toBe(0);
  });
  it('keeps the image data of the existing campaign when the id matches', () => {
    const current: BackupData = { ...empty(), campaigns: [campaign({ images: [img('keep')] })] };
    const incoming = roundTrip({ ...empty(), campaigns: [campaign({ images: [img('other')] })] });
    expect(planImport(current, incoming.backup).merged.campaigns[0]?.images?.[0]?.id).toBe('keep');
  });
  it('fits a full set of images inside the file size limit', () => {
    const images = Array.from({ length: 4 }, (_, i) => img(`i${i}`, LIMITS.maxImageBytes));
    const json = JSON.stringify(buildBackup({ ...empty(), campaigns: [campaign({ images })] }, '0.5.0', NOW), null, 2);
    expect(new TextEncoder().encode(json).length).toBeLessThan(MAX_BACKUP_BYTES);
    expect(parseBackup(json).ok).toBe(true);
  });
});
