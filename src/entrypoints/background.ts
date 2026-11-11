import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { validateImages, totalImageBytes } from '@/lib/images';
import { LIMITS } from '@/lib/limits';
import { renderPost } from '@/lib/template';
import { isRunCommand, type CommandReply, type GroupNameReply, type GroupNameRequest, type JoinedGroupsReply, type JoinedGroupsRequest, type PostReply, type PostRequest, type RunCommand, type FeedCommentRequest, type FeedPickRequest, type FeedPickReply } from '@/lib/messages';
import { historyKeysForGroup } from '@/lib/comment-pick';
import { fillDefaultComments, withDefaultCampaigns } from '@/lib/defaults';
import { parseLatestRelease, UPDATE_API_URL, updateCheckDue } from '@/lib/update';
import { describeRunEnd } from '@/lib/notify';
import { applyOutcome, commentLockUntil, continueRun, createRun, IDLE_RUN, isActive, isCommentLocked, pause, pickVariation, resume, stop } from '@/lib/run-engine';
import { dueOccurrences, isMissed, nextOccurrence, validateTimes } from '@/lib/schedule';
import { appendLog, campaignsItem, commentLockItem, commentTabItem, groupsItem, joinedScanItem, logsItem, runItem, scheduleCheckItem, commentedPostsItem, safeScanItem, settingsItem, updateItem } from '@/lib/storage';
import { newId } from '@/lib/id';
import { canonicalGroupUrl, hasPlaceholderName, newestPostsGroupUrl, withReadName } from '@/lib/groups';
import type { Campaign, Group, LogStatus, PostOutcome, RunState } from '@/lib/types';

const ALARM = 'cap-next-post';
const SCHEDULE_ALARM = 'cap-schedule';
const UPDATE_ALARM = 'cap-update-check';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (r: CommandReply) => void) => {
    if (!isRunCommand(message)) return false;
    handleCommand(message, facebookTabOf(sender)).then(sendResponse, (e: unknown) => sendResponse({ ok: false, error: String(e) }));
    return true; // async response
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void runStep();
    if (alarm.name === SCHEDULE_ALARM) void processSchedule();
    if (alarm.name === UPDATE_ALARM) void checkForUpdate(false);
  });

  // Saving or deleting a campaign changes the schedule. Nothing before "now" counts as due then.
  campaignsItem.watch(() => {
    void scheduleCheckItem.setValue(Date.now()).then(rescheduleAlarm);
  });

  // First install: start with the two ready-made campaigns. The post campaign cannot run until the user writes its text.
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'update') {
      // A default comment campaign made by an older version has empty text: give it the sample comments.
      void (async () => {
        const result = fillDefaultComments(await campaignsItem.getValue());
        if (result.filled) await campaignsItem.setValue(result.campaigns);
      })();
      return;
    }
    if (reason !== 'install') return;
    void (async () => {
      if ((await campaignsItem.getValue()).length > 0) return;
      await campaignsItem.setValue(withDefaultCampaigns([], await groupsItem.getValue(), Date.now()).campaigns);
    })();
  });

  // The service worker can be restarted at any time; rebuild the timers from stored state.
  void restoreSchedule();
  void processSchedule();
  // Daily update check (owner-approved exception to "no remote calls"): one GET to GitHub's release API.
  void browser.alarms.create(UPDATE_ALARM, { periodInMinutes: 60 });
  void checkForUpdate(false);
});

async function restoreSchedule(): Promise<void> {
  const run = await runItem.getValue();
  if (run.status === 'running' && run.nextAt !== null) await schedule(run.nextAt);
}

/** Chrome fires an alarm no sooner than 30 s after it was created. */
const ALARM_FLOOR_MS = 30_000;
let shortTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * The alarm is what survives a service worker restart. A wait shorter than Chrome's alarm floor (comment
 * campaigns) is also timed in the running worker, which stays alive that long; whichever fires first runs
 * the step, and `runStep` ignores a call that comes before `nextAt`.
 */
async function schedule(at: number | null): Promise<void> {
  clearTimeout(shortTimer);
  shortTimer = undefined;
  await browser.alarms.clear(ALARM);
  if (at === null) return;
  const wait = at - Date.now();
  await browser.alarms.create(ALARM, { when: Math.max(at, Date.now() + 1000) });
  if (wait < ALARM_FLOOR_MS) shortTimer = setTimeout(() => void runStep(), Math.max(0, wait));
}

/** Null when a comment run may start; otherwise why not (locked after a checkpoint or block). */
async function commentLockProblem(campaign: Campaign): Promise<string | null> {
  if (campaign.mode !== 'comment') return null;
  const until = await commentLockItem.getValue();
  if (!isCommentLocked(until, Date.now())) return null;
  return `Facebook đã cảnh báo hoặc chặn trong lượt bình luận trước. Chiến dịch bình luận bị khóa đến ${new Date(until).toLocaleString('vi-VN')}.`;
}

const hhmm = (ts: number) => new Date(ts).toTimeString().slice(0, 5);

/** Campaigns whose schedule is on and still respects the limits (stored data is not trusted). */
async function scheduledCampaigns(): Promise<Campaign[]> {
  return (await campaignsItem.getValue()).filter((c) => c.schedule?.enabled && validateTimes(c.schedule.times) === null);
}

/** Earliest upcoming slot over all campaigns that have the schedule on. */
async function rescheduleAlarm(): Promise<void> {
  const now = Date.now();
  const slots = (await scheduledCampaigns())
    .map((c) => nextOccurrence(c.schedule?.times ?? [], now))
    .filter((t): t is number => t !== null);
  await browser.alarms.clear(SCHEDULE_ALARM);
  if (slots.length > 0) await browser.alarms.create(SCHEDULE_ALARM, { when: Math.min(...slots) });
}

let processing = false;

/** Starts runs for slots that came due since the last check; skips late or overlapping ones. */
async function processSchedule(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    const now = Date.now();
    const since = (await scheduleCheckItem.getValue()) ?? now;
    await scheduleCheckItem.setValue(now);
    const due = (await scheduledCampaigns())
      .flatMap((c) => dueOccurrences(c.schedule?.times ?? [], since, now).map((at) => ({ campaign: c, at })))
      .sort((a, b) => a.at - b.at);

    for (const { campaign, at } of due) {
      const label = hhmm(at);
      if (isMissed(at, now)) {
        await log(campaign.id, null, 'info', `Bỏ lỡ lịch ${label}.`);
        continue;
      }
      const reply = await startRun(campaign.id);
      if (!reply.ok) await log(campaign.id, null, 'info', `Bỏ qua lịch ${label}: ${reply.error ?? 'không thể bắt đầu.'}`);
    }
  } finally {
    processing = false;
    await rescheduleAlarm();
  }
}

let checkingUpdate = false;

/**
 * Reads the latest release of the public releases repository and stores it in `updateItem`. Automatic checks
 * run at most once a day (the hourly alarm only asks whether one is due); `force` is the user's button.
 * Sends no cookies or user data; the request is a plain GET. Installing stays manual (see lib/update.ts).
 */
async function checkForUpdate(force: boolean): Promise<CommandReply> {
  if (checkingUpdate) return { ok: false, error: 'Đang kiểm tra cập nhật.' };
  const now = Date.now();
  if (!force && !updateCheckDue(await updateItem.getValue(), now)) return { ok: true };
  checkingUpdate = true;
  try {
    const response = await fetch(UPDATE_API_URL, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) throw new Error(response.status === 404 ? 'Chưa có bản phát hành nào.' : `GitHub trả về lỗi ${response.status}.`);
    const latest = parseLatestRelease(await response.json());
    if (!latest) throw new Error('Không đọc được bản phát hành mới nhất.');
    await updateItem.setValue({ checkedAt: now, latest, error: null });
    return { ok: true };
  } catch (e) {
    const error = e instanceof TypeError ? 'Không kết nối được GitHub.' : e instanceof Error ? e.message : String(e);
    const previous = await updateItem.getValue();
    await updateItem.setValue({ checkedAt: now, latest: previous?.latest ?? null, error });
    return { ok: false, error };
  } finally {
    checkingUpdate = false;
  }
}

/** Turns every schedule off. Used after a checkpoint or block: the user must re-enable it. */
async function disableAllSchedules(campaignId: string): Promise<void> {
  const list = await campaignsItem.getValue();
  if (!list.some((c) => c.schedule?.enabled)) return;
  await campaignsItem.setValue(list.map((c) => (c.schedule?.enabled ? { ...c, schedule: { ...c.schedule, enabled: false } } : c)));
  await log(campaignId, null, 'info', 'Đã tắt toàn bộ lịch chạy vì Facebook yêu cầu kiểm tra hoặc chặn. Hãy bật lại sau khi xử lý xong trên Facebook.');
}

/** The Facebook tab a command came from (the chat box is framed in one); undefined from the dashboard tab. */
function facebookTabOf(sender: { tab?: { id?: number; windowId?: number; url?: string } }): { tabId: number; windowId: number } | undefined {
  const tab = sender.tab;
  if (tab?.id === undefined || tab.windowId === undefined || !/^https:\/\/([a-z0-9-]+\.)?facebook\.com\//.test(tab.url ?? '')) return undefined;
  return { tabId: tab.id, windowId: tab.windowId };
}

/**
 * Shared by the Start button and the daily schedule. Started from the chat box, the run uses the Facebook tab
 * the user is on; otherwise (dashboard tab, schedule) it opens its own tab as before.
 */
async function startRun(campaignId: string, here?: { tabId: number; windowId: number }): Promise<CommandReply> {
  const run = await runItem.getValue();
  if (isActive(run)) return { ok: false, error: 'Đang có một lượt chạy khác.' };
  const campaign = (await campaignsItem.getValue()).find((c) => c.id === campaignId);
  if (!campaign) return { ok: false, error: 'Không tìm thấy chiến dịch.' };
  const problem = validateCampaign(campaign, await campaignsItem.getValue()) ?? (await commentLockProblem(campaign));
  if (problem) return { ok: false, error: problem };
  const state = createRun(campaign, Date.now());
  await closeCommentWindow();
  await commentTabItem.setValue(here ? { ...here, groupId: '', runStartedAt: state.startedAt ?? 0, keepOpen: true } : null);
  if (campaign.mode === 'comment' && campaign.safeMode) await safeScanItem.setValue({ startedAt: state.startedAt ?? 0, campaignId: campaign.id, posts: [] });
  await runItem.setValue(state);
  await log(campaign.id, null, 'info', campaign.mode === 'comment'
    ? `Đã bắt đầu ${campaign.safeMode ? "Safe Mode: quét" : "chạy: tối đa"} ${state.total} ${campaign.safeMode ? "bài" : "lượt bình luận"} trên ${campaign.groupIds.length} nhóm.`
    : `Đã bắt đầu chạy: ${state.total} nhóm.`);
  void runStep(); // first post goes out immediately
  return { ok: true };
}

async function handleCommand(cmd: RunCommand, here?: { tabId: number; windowId: number }): Promise<CommandReply> {
  const run = await runItem.getValue();
  switch (cmd.type) {
    case 'cap/run/start':
      return startRun(cmd.campaignId, here);
    case 'cap/run/pause': {
      await runItem.setValue(pause(run));
      await schedule(null);
      if (!stepping) await closeCommentWindow();
      return { ok: true };
    }
    case 'cap/run/resume': {
      const campaign = await currentCampaign(run);
      if (!campaign) return { ok: false, error: 'Không tìm thấy chiến dịch.' };
      const next = resume(run, campaign, Date.now());
      await runItem.setValue(next);
      await schedule(next.nextAt);
      return { ok: true };
    }
    case 'cap/run/continue': {
      if (stepping) return { ok: false, error: 'Lượt gửi trước đang hoàn tất. Hãy thử lại sau vài giây.' };
      if (run.status !== 'stopped') return { ok: false, error: 'Chỉ chạy tiếp được lượt đã dừng.' };
      const campaign = await currentCampaign(run);
      if (!campaign) return { ok: false, error: 'Không tìm thấy chiến dịch.' };
      if (Boolean(run.safeMode) !== (campaign.mode === 'comment' && campaign.safeMode === true)) return { ok: false, error: 'Chế độ Safe Mode đã thay đổi. Hãy bắt đầu một lượt chạy mới.' };
      const problem = validateCampaign(campaign, await campaignsItem.getValue()) ?? (await commentLockProblem(campaign));
      if (problem) return { ok: false, error: problem };
      const next = continueRun(run, campaign, await logsItem.getValue(), Date.now());
      await runItem.setValue(next);
      const skipped = next.attempted - run.attempted;
      await log(campaign.id, null, 'info', next.status === 'done'
        ? 'Không còn nhóm nào cần chạy tiếp.'
        : `Chạy tiếp lượt đã dừng: còn ${next.queue.length} mục${skipped > 0 ? `, bỏ qua ${skipped} nhóm đã đăng` : ''}.`);
      await schedule(next.status === 'running' ? next.nextAt : null);
      return { ok: true };
    }
    case 'cap/run/stop': {
      await runItem.setValue(stop(run));
      await schedule(null);
      if (!stepping) await closeCommentWindow();
      return { ok: true };
    }
    case 'cap/run/fetch-names': {
      if (isActive(run)) return { ok: false, error: 'Hãy dừng lượt chạy trước.' };
      if (fetchingNames) return { ok: false, error: 'Đang lấy tên nhóm.' };
      void fetchGroupNames(); // runs in the background; the UI watches storage
      return { ok: true };
    }
    case 'cap/run/fetch-joined': {
      if (isActive(run)) return { ok: false, error: 'Hãy dừng lượt chạy trước.' };
      if (fetchingNames || fetchingJoined) return { ok: false, error: 'Đang đọc dữ liệu từ Facebook, hãy chờ xong.' };
      void fetchJoinedGroups(); // runs in the background; the UI watches joinedScanItem
      return { ok: true };
    }
    case 'cap/run/check-update':
      return checkForUpdate(true);
    case 'cap/run/reset': {
      if (isActive(run)) return { ok: false, error: 'Hãy dừng lượt chạy trước.' };
      await runItem.setValue(IDLE_RUN);
      await closeCommentWindow();
      await commentTabItem.setValue(null);
      return { ok: true };
    }
  }
}

function validateCampaign(c: Campaign, all: Campaign[]): string | null {
  if (c.groupIds.length === 0) return 'Hãy chọn ít nhất một nhóm.';
  if (c.groupIds.length > LIMITS.maxGroupsPerCampaign) return `Mỗi chiến dịch tối đa ${LIMITS.maxGroupsPerCampaign} nhóm.`;
  if (c.mode === 'comment' && (!Number.isInteger(c.commentsPerGroup) || (c.commentsPerGroup ?? 0) < 1 || (c.commentsPerGroup ?? 0) > LIMITS.maxCommentsPerGroup)) return 'Số bài mỗi nhóm không hợp lệ.';
  if (!(c.mode === 'comment' && c.safeMode) && !c.variations.some((v) => v.trim())) return 'Hãy viết nội dung bài đăng trước.';
  if (c.variations.some((v) => v.length > LIMITS.maxPostLength)) return 'Bài đăng quá dài.';
  if (c.commentNewestPosts && (c.mode !== 'comment' || (c.commentsPerGroup ?? 0) > LIMITS.maxNewestPostComments)) return `Chế độ bài mới nhất chỉ dùng cho chiến dịch bình luận, tối đa ${LIMITS.maxNewestPostComments} bài mỗi nhóm.`;
  if (c.mode !== 'comment' && c.images?.length) {
    const otherBytes = all.filter((o) => o.id !== c.id).reduce((sum, o) => sum + totalImageBytes(o.images ?? []), 0);
    return validateImages(c.images, otherBytes);
  }
  return null;
}

async function currentCampaign(run: RunState): Promise<Campaign | undefined> {
  return (await campaignsItem.getValue()).find((c) => c.id === run.campaignId);
}

let stepping = false;

/** Posts to the next group in the queue, then schedules the following one. */
async function runStep(): Promise<void> {
  if (stepping) return;
  stepping = true;
  try {
    const run = await runItem.getValue();
    if (run.status !== 'running') return;
    // Called early (a short timer and the alarm both exist): wait for the real time.
    if (run.nextAt !== null && run.nextAt - Date.now() > 250) {
      await schedule(run.nextAt);
      return;
    }
    const campaign = await currentCampaign(run);
    const groupId = run.queue[0];
    if (!campaign || !groupId) {
      await runItem.setValue({ ...run, status: 'halted', reason: 'Thiếu chiến dịch hoặc nhóm.', nextAt: null });
      return;
    }
    // A read-only run must never become a posting run, even if its campaign changes while stopped.
    if (run.safeMode && (campaign.mode !== 'comment' || !campaign.safeMode)) {
      const reason = 'Chế độ Safe Mode đã thay đổi. Hãy bắt đầu một lượt chạy mới.';
      await runItem.setValue({ ...run, status: 'halted', reason, nextAt: null });
      await log(campaign.id, null, 'info', reason);
      await closeCommentWindow();
      await schedule(null);
      return;
    }
    const group = (await groupsItem.getValue()).find((g) => g.id === groupId);
    const text = pickVariation(campaign.variations, run.attempted);

    const outcome: PostOutcome = group
      ? campaign.mode === 'comment' ? await commentInGroup(group, text, run, campaign) : await postToGroup(group, text, campaign, run)
      : { kind: 'skipped', reason: 'Nhóm đã bị xóa.' };

    // The name may have just been read from the page, so log with the stored group.
    const logGroup = (await groupsItem.getValue()).find((g) => g.id === groupId) ?? group ?? null;

    // The user may have pressed Stop/Pause while we were posting; honour that.
    const latest = await runItem.getValue();
    if (latest.status !== 'running') {
      await log(campaign.id, logGroup, toStatus(outcome), describe(outcome, campaign.mode));
      await closeCommentWindow();
      return;
    }

    const { state, breakMinutes, retry } = applyOutcome(latest, campaign, outcome, Date.now());
    if (retry) {
      const seconds = Math.round(LIMITS.retryDelayMs / 1000);
      await log(campaign.id, logGroup, 'info', `Lỗi tạm thời, thử lại sau ${seconds} giây: ${describe(outcome, campaign.mode)}`);
    } else {
      await log(campaign.id, logGroup, toStatus(outcome), describe(outcome, campaign.mode));
    }
    if (breakMinutes !== null) await log(campaign.id, null, 'break', `Nghỉ an toàn: ${breakMinutes} phút.`);
    if (state.status === 'done') await log(campaign.id, null, 'info', 'Đã chạy xong.');
    if (state.status === 'halted' || state.status === 'paused') await log(campaign.id, null, 'info', state.reason ?? '');
    await runItem.setValue(state);
    if (state.status !== 'running') await closeCommentWindow();
    if (state.status === 'halted') await disableAllSchedules(campaign.id);
    if (state.status === 'halted' && campaign.mode === 'comment') {
      const until = commentLockUntil(Date.now());
      await commentLockItem.setValue(until);
      await log(campaign.id, null, 'info', `Chiến dịch bình luận bị khóa đến ${new Date(until).toLocaleString('vi-VN')}. Hãy xử lý cảnh báo trên Facebook và không bình luận thêm trong thời gian này.`);
    }
    await schedule(state.status === 'running' ? state.nextAt : null);
    await notifyRunEnd(latest.status, state, campaign);
  } finally {
    stepping = false;
  }
}

/** Opt-in desktop notification. Never throws: a notification problem must not affect the run. */
async function notifyRunEnd(previous: RunState['status'], state: RunState, campaign: Campaign): Promise<void> {
  try {
    if (!(await settingsItem.getValue()).notifyOnFinish) return;
    const notice = describeRunEnd(previous, state, campaign);
    if (!notice) return;
    await browser.notifications.create(`cap-run-${Date.now()}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title: notice.title,
      message: notice.message,
    });
  } catch {
    // notifications are optional
  }
}

async function saveGroupName(id: string, name: string): Promise<void> {
  await groupsItem.setValue(withReadName(await groupsItem.getValue(), id, name));
}

/** Asks the open group tab for its name. Never throws. */
async function askGroupName(tabId: number): Promise<GroupNameReply> {
  try {
    const request: GroupNameRequest = { type: 'cap/group-name' };
    return (await sendWithRetry(tabId, request)) as GroupNameReply;
  } catch {
    return { name: null };
  }
}

let fetchingNames = false;
const NAME_FETCH_GAP_MS = 3000;

/** Opt-in, read-only: visits each unnamed group once, one at a time, and stores its name. */
async function fetchGroupNames(): Promise<void> {
  fetchingNames = true;
  try {
    const pending = (await groupsItem.getValue()).filter(hasPlaceholderName);
    for (const group of pending) {
      if (isActive(await runItem.getValue())) return; // a run started meanwhile
      let tabId: number | undefined;
      try {
        const tab = await browser.tabs.create({ url: group.url, active: false });
        tabId = tab.id;
        if (tabId === undefined) continue;
        await waitForTab(tabId);
        const reply = await askGroupName(tabId);
        if (reply.fatal) return; // checkpoint or block: stop touching Facebook
        if (reply.name) await saveGroupName(group.id, reply.name);
      } catch {
        // a group that fails to load keeps its placeholder name
      } finally {
        if (tabId !== undefined) await browser.tabs.remove(tabId).catch(() => undefined);
      }
      await new Promise((r) => setTimeout(r, NAME_FETCH_GAP_MS));
    }
  } finally {
    fetchingNames = false;
  }
}

let fetchingJoined = false;
const JOINED_URL = 'https://www.facebook.com/groups/joins/?nav_source=tab';

/**
 * Opt-in, read-only: opens Facebook's "groups you joined" page as the active tab of the current window (the list
 * loads only while scrolled in a rendered page), lets the content script read it, stores the result as a preview,
 * closes the tab and shows the user's previous tab again. Nothing is added to the group list here; the user chooses in the UI.
 */
async function fetchJoinedGroups(): Promise<void> {
  fetchingJoined = true;
  let opened: { tabId: number; returnTabId?: number } | undefined;
  await joinedScanItem.setValue({ status: 'running', at: Date.now(), groups: [] });
  try {
    opened = await openVisibleTab(JOINED_URL);
    const { tabId } = opened;
    await waitForTab(tabId, 'https://www.facebook.com/groups/joins');
    const request: JoinedGroupsRequest = { type: 'cap/joined-groups' };
    const reply = (await withTimeout(sendWithRetry(tabId, request), LIMITS.joinedScanTimeoutMs + 30_000, 'Hết thời gian đọc danh sách nhóm.')) as JoinedGroupsReply;
    if (reply.problem) throw new Error(reply.problem.reason);
    await joinedScanItem.setValue({ status: 'done', at: Date.now(), groups: reply.groups, ...(reply.expected !== undefined ? { expected: reply.expected } : {}) });
  } catch (e) {
    await joinedScanItem.setValue({ status: 'failed', at: Date.now(), groups: [], error: e instanceof Error ? e.message : String(e) });
  } finally {
    if (opened) await closeVisibleTab(opened.tabId, opened.returnTabId);
    fetchingJoined = false;
  }
}

/** The user's own tab this run was started from, while it is still open. */
async function ownRunTab(run: RunState): Promise<number | undefined> {
  const saved = await commentTabItem.getValue();
  if (!saved?.keepOpen || saved.runStartedAt !== run.startedAt) return undefined;
  return (await browser.tabs.get(saved.tabId).catch(() => null)) ? saved.tabId : undefined;
}

async function postToGroup(group: Group, template: string, campaign: Campaign, run: RunState): Promise<PostOutcome> {
  let tabId: number | undefined;
  // Started from the chat box: post in the user's own tab, which is navigated and never closed.
  const own = await ownRunTab(run);
  // Until the page has loaded nothing can have been submitted, so a failure up to that point is safe to retry.
  let loaded = false;
  try {
    if (own !== undefined) {
      tabId = own;
      await browser.tabs.update(own, { url: group.url });
      await waitForTab(own, group.url);
    } else {
      const tab = await browser.tabs.create({ url: group.url, active: false });
      tabId = tab.id;
      if (tabId === undefined) return { kind: 'failed', reason: 'Không mở được tab.', retryable: true };
      await waitForTab(tabId);
    }
    loaded = true;
    if (hasPlaceholderName(group)) {
      const found = await askGroupName(tabId);
      if (found.name) await saveGroupName(group.id, found.name);
    }
    // The only place where {group} is replaced: with the stored name, which may have just been read above.
    const stored = (await groupsItem.getValue()).find((g) => g.id === group.id) ?? group;
    const rendered = renderPost(template, hasPlaceholderName(stored) ? null : stored.name);
    if (!rendered.ok) return { kind: 'failed', reason: rendered.reason };
    const request: PostRequest = {
      type: 'cap/post',
      text: rendered.text,
      ...(campaign.images?.length ? { images: campaign.images.map(({ name, mime, dataUrl }) => ({ name, mime, dataUrl })) } : {}),
      ...(campaign.removeLinkPreview ? { removeLinkPreview: true } : {}),
    };
    const reply = (await withTimeout(
      sendWithRetry(tabId, request),
      LIMITS.postTimeoutMs,
      'Hết thời gian chờ khi đăng bài.',
    )) as PostReply;
    return reply;
  } catch (e) {
    return { kind: 'failed', reason: e instanceof Error ? e.message : String(e), ...(loaded ? {} : { retryable: true }) };
  } finally {
    if (tabId !== undefined && tabId !== own) await browser.tabs.remove(tabId).catch(() => undefined);
  }
}

const onFeed = (url: string | undefined, groupId: string) =>
  (url ?? '').startsWith(canonicalGroupUrl(groupId)) && !/\/(posts|permalink)\//.test(url ?? '');

/**
 * Opens a Facebook page as the active tab of the window the user is in (no new window). It must be the active,
 * visible tab: Chrome stops rendering hidden tabs and Facebook then loads no further posts. The tab the user was
 * on is returned so it can be shown again when CAP is done.
 */
async function openVisibleTab(url: string): Promise<{ tabId: number; windowId: number; returnTabId?: number }> {
  const [current] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = await browser.tabs.create({ url, active: true, ...(current?.windowId !== undefined ? { windowId: current.windowId } : {}) });
  if (tab.id === undefined || tab.windowId === undefined) throw new Error('Không mở được tab Facebook.');
  return { tabId: tab.id, windowId: tab.windowId, ...(current?.id !== undefined ? { returnTabId: current.id } : {}) };
}

/** Closes a tab CAP opened and shows the tab the user was on before. Never throws. */
async function closeVisibleTab(tabId: number, returnTabId?: number): Promise<void> {
  await browser.tabs.remove(tabId).catch(() => undefined);
  if (returnTabId !== undefined) await browser.tabs.update(returnTabId, { active: true }).catch(() => undefined);
}

/**
 * Comment campaigns use one visible tab in the user's current window. It is reused for the next comment in the
 * same group, so the feed is not loaded and scanned again, and moved to the next group by navigating it.
 * If the user switched to another tab meanwhile, it is brought to the front again, since a hidden tab loads nothing.
 */
async function openGroupFeed(group: Group, run: RunState): Promise<number> {
  const url = newestPostsGroupUrl(group.id);
  const saved = await commentTabItem.getValue();
  const tab = saved ? await browser.tabs.get(saved.tabId).catch(() => null) : null;
  if (saved && tab && saved.runStartedAt === run.startedAt) {
    if (saved.groupId === group.id && onFeed(tab.url, group.id)) {
      if (!tab.active) await browser.tabs.update(saved.tabId, { active: true });
      return saved.tabId;
    }
    await commentTabItem.setValue({ ...saved, groupId: group.id });
    await browser.tabs.update(saved.tabId, { url, active: true });
    await waitForTab(saved.tabId, canonicalGroupUrl(group.id));
    return saved.tabId;
  }
  await closeCommentWindow();
  const opened = await openVisibleTab(url);
  await commentTabItem.setValue({ ...opened, groupId: group.id, runStartedAt: run.startedAt ?? 0 });
  await waitForTab(opened.tabId, canonicalGroupUrl(group.id));
  return opened.tabId;
}

/** Closes the comment tab, if one is open, and shows the user's previous tab again. Never throws. */
async function closeCommentWindow(): Promise<void> {
  const saved = await commentTabItem.getValue();
  // The user's own tab stays open and stays the run's tab, so Continue after Stop or Pause keeps using it.
  if (!saved || saved.keepOpen) return;
  await commentTabItem.setValue(null);
  await closeVisibleTab(saved.tabId, saved.returnTabId);
}

/**
 * One comment: scan the group feed for a usable post (in the page), reserve it, then comment on it.
 * The post's keys and this run slot are saved before typing, so an uncertain submission is never retried.
 */
async function commentInGroup(group: Group, text: string, run: RunState, campaign: Campaign): Promise<PostOutcome> {
  try {
    const slot = `slot:${run.campaignId}:${run.startedAt}:${run.attempted}`;
    const history = Object.fromEntries(Object.entries(await commentedPostsItem.getValue()).filter(([key, at]) => !key.startsWith('slot:') || at > Date.now() - 7 * 86400_000));
    const scan = run.safeMode ? await safeScanItem.getValue() : null;
    if (run.safeMode && scan && scan.startedAt === run.startedAt && scan.posts.some((post) => post.slot === slot)) return { kind: 'scanned', reason: 'Bài đã được lưu trước khi lượt quét bị gián đoạn.' };
    if (!run.safeMode && history[slot]) return { kind: 'skipped', reason: 'Lượt bình luận đã được xử lý trước khi gián đoạn.' };
    const tabId = await openGroupFeed(group, run);
    if (hasPlaceholderName(group)) {
      const found = await askGroupName(tabId);
      if (found.fatal) return { kind: 'fatal', reason: found.fatal };
      if (found.name) await saveGroupName(group.id, found.name);
    }
    const pickRequest: FeedPickRequest = {
      type: 'cap/feed-pick',
      groupId: group.id,
      mode: campaign.commentNewestPosts ? 'newest' : 'recent',
      tried: [...historyKeysForGroup(history, group.id), ...(scan && scan.startedAt === run.startedAt ? scan.posts.filter((post) => post.groupId === group.id).flatMap((post) => post.keys) : [])],
      ownTexts: campaign.variations.map((v) => v.trim()).filter(Boolean),
    };
    const pick = (await withTimeout(sendWithRetry(tabId, pickRequest), LIMITS.feedScanTimeoutMs + 30_000, 'Hết thời gian quét bài trong nhóm.')) as FeedPickReply;
    // A group we are not a member of, or whose feed cannot be read, is left at once instead of once per slot.
    if (pick.problem) return pick.problem.kind === 'fatal' ? pick.problem : { ...pick.problem, skipRemainingGroup: true };
    if (!pick.fingerprint || !pick.keys?.length) {
      return { kind: 'skipped', skipRemainingGroup: true, reason: pick.diagnostic ?? 'Không có bài phù hợp để bình luận.' };
    }
    const latest = await runItem.getValue();
    if (latest.status !== 'running' || latest.startedAt !== run.startedAt || latest.attempted !== run.attempted) return { kind: 'skipped', reason: 'Lượt chạy đã thay đổi.' };
    if (run.safeMode) {
      const current = await safeScanItem.getValue();
      if (!current || current.startedAt !== run.startedAt || current.campaignId !== campaign.id) return { kind: 'failed', reason: 'Không tìm thấy kết quả lượt quét hiện tại.' };
      await safeScanItem.setValue({ ...current, posts: [...current.posts, { slot, keys: pick.keys, groupId: group.id, groupName: group.name, url: pick.post?.url ?? null, author: pick.post?.author ?? '', text: pick.post?.text ?? '', age: pick.post?.age ?? null }] });
      return { kind: 'scanned', reason: 'Safe Mode: đã lưu bài phù hợp, không gửi bình luận.' };
    }
    const now = Date.now();
    await commentedPostsItem.setValue({ ...history, ...Object.fromEntries(pick.keys.map((key) => [key, now])), [slot]: now });
    if (pick.diagnostic) await log(campaign.id, group, 'info', pick.diagnostic);
    const comment: FeedCommentRequest = { type: 'cap/feed-comment', fingerprint: pick.fingerprint, text };
    const outcome = (await withTimeout(browser.tabs.sendMessage(tabId, comment), LIMITS.postTimeoutMs, 'Hết thời gian chờ bình luận.')) as PostOutcome;
    // `retryable` means nothing was typed or sent, so the post goes back to the pool instead of staying reserved.
    if (outcome.kind === 'failed' && outcome.retryable) {
      const released = new Set(pick.keys);
      const current = await commentedPostsItem.getValue();
      await commentedPostsItem.setValue(Object.fromEntries(Object.entries(current).filter(([key]) => !released.has(key))));
    }
    return outcome;
  } catch (e) {
    return { kind: 'failed', reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Resolves once the tab has finished loading. With `expected`, a tab that is still on another group page
 * (just navigated, not yet committed) does not count; a redirect away from groups (login, checkpoint) does.
 */
function waitForTab(tabId: number, expected?: string): Promise<void> {
  const ready = (t: { status?: string; url?: string; pendingUrl?: string }) =>
    t.status === 'complete' && !t.pendingUrl && (!expected || (t.url ?? '').startsWith(expected) || !(t.url ?? '').includes('facebook.com/groups/'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Trang nhóm tải quá lâu.')), LIMITS.tabLoadTimeoutMs);
    const onUpdated = (id: number, _info: unknown, tab: { status?: string; url?: string; pendingUrl?: string }) => {
      if (id === tabId && ready(tab)) done();
    };
    function done(err?: Error) {
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(onUpdated);
      err ? reject(err) : resolve();
    }
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.get(tabId).then((t) => ready(t) && done()).catch(() => done(new Error('Tab đã bị đóng.')));
  });
}

/** The content script may not be ready the instant the tab reports complete. */
async function sendWithRetry(tabId: number, msg: PostRequest | GroupNameRequest | FeedPickRequest | JoinedGroupsRequest): Promise<unknown> {
  let lastError: unknown;
  for (let i = 0; i < 8; i++) {
    try {
      return await browser.tabs.sendMessage(tabId, msg);
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Content script không phản hồi.');
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

const toStatus = (o: PostOutcome): LogStatus =>
  o.kind === 'scanned' ? 'info' : o.kind === 'posted' ? 'posted' : o.kind === 'pending' ? 'pending' : o.kind === 'skipped' ? 'skipped' : 'failed';

const describe = (o: PostOutcome, mode?: Campaign['mode']): string => {
  if (o.kind === 'scanned') return o.reason;
  if (o.kind === 'posted') return mode === 'comment' ? 'Đã gửi bình luận.' : 'Đã gửi bài đăng.';
  if (o.kind === 'pending') return 'Đã gửi bài, đang chờ quản trị viên nhóm phê duyệt.';
  return o.reason;
};

async function log(campaignId: string, group: Group | null, status: LogStatus, message: string): Promise<void> {
  await appendLog({
    id: newId(),
    ts: Date.now(),
    campaignId,
    groupId: group?.id ?? '',
    groupName: group?.name ?? '',
    status,
    message,
  });
}
