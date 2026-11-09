import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { LIMITS } from '@/lib/limits';
import { isRunCommand, type CommandReply, type GroupNameReply, type GroupNameRequest, type PostReply, type PostRequest, type RunCommand, type DiscoverRequest, type DiscoverReply, type CommentRequest } from '@/lib/messages';
import { describeRunEnd } from '@/lib/notify';
import { applyOutcome, continueRun, createRun, IDLE_RUN, isActive, pause, pickVariation, resume, stop } from '@/lib/run-engine';
import { dueOccurrences, isMissed, nextOccurrence, validateTimes } from '@/lib/schedule';
import { appendLog, campaignsItem, groupsItem, logsItem, runItem, scheduleCheckItem, commentedPostsItem, settingsItem } from '@/lib/storage';
import { newId } from '@/lib/id';
import { hasPlaceholderName, recentActivityGroupUrl, withReadName } from '@/lib/groups';
import type { Campaign, Group, LogStatus, PostOutcome, RunState } from '@/lib/types';

const ALARM = 'cap-next-post';
const SCHEDULE_ALARM = 'cap-schedule';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (r: CommandReply) => void) => {
    if (!isRunCommand(message)) return false;
    handleCommand(message).then(sendResponse, (e: unknown) => sendResponse({ ok: false, error: String(e) }));
    return true; // async response
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void runStep();
    if (alarm.name === SCHEDULE_ALARM) void processSchedule();
  });

  // Saving or deleting a campaign changes the schedule. Nothing before "now" counts as due then.
  campaignsItem.watch(() => {
    void scheduleCheckItem.setValue(Date.now()).then(rescheduleAlarm);
  });

  // The service worker can be restarted at any time; rebuild the timers from stored state.
  void restoreSchedule();
  void processSchedule();
});

async function restoreSchedule(): Promise<void> {
  const run = await runItem.getValue();
  if (run.status === 'running' && run.nextAt !== null) await schedule(run.nextAt);
}

async function schedule(at: number | null): Promise<void> {
  await browser.alarms.clear(ALARM);
  if (at !== null) await browser.alarms.create(ALARM, { when: Math.max(at, Date.now() + 1000) });
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

/** Turns every schedule off. Used after a checkpoint or block: the user must re-enable it. */
async function disableAllSchedules(campaignId: string): Promise<void> {
  const list = await campaignsItem.getValue();
  if (!list.some((c) => c.schedule?.enabled)) return;
  await campaignsItem.setValue(list.map((c) => (c.schedule?.enabled ? { ...c, schedule: { ...c.schedule, enabled: false } } : c)));
  await log(campaignId, null, 'info', 'Đã tắt toàn bộ lịch chạy vì Facebook yêu cầu kiểm tra hoặc chặn. Hãy bật lại sau khi xử lý xong trên Facebook.');
}

/** Shared by the Start button and the daily schedule. */
async function startRun(campaignId: string): Promise<CommandReply> {
  const run = await runItem.getValue();
  if (isActive(run)) return { ok: false, error: 'Đang có một lượt chạy khác.' };
  const campaign = (await campaignsItem.getValue()).find((c) => c.id === campaignId);
  if (!campaign) return { ok: false, error: 'Không tìm thấy chiến dịch.' };
  const problem = validateCampaign(campaign);
  if (problem) return { ok: false, error: problem };
  const state = createRun(campaign, Date.now());
  await runItem.setValue(state);
  await log(campaign.id, null, 'info', campaign.mode === 'comment'
    ? `Đã bắt đầu chạy: tối đa ${state.total} lượt bình luận trên ${campaign.groupIds.length} nhóm.`
    : `Đã bắt đầu chạy: ${state.total} nhóm.`);
  void runStep(); // first post goes out immediately
  return { ok: true };
}

async function handleCommand(cmd: RunCommand): Promise<CommandReply> {
  const run = await runItem.getValue();
  switch (cmd.type) {
    case 'cap/run/start':
      return startRun(cmd.campaignId);
    case 'cap/run/pause': {
      await runItem.setValue(pause(run));
      await schedule(null);
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
      const problem = validateCampaign(campaign);
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
      return { ok: true };
    }
    case 'cap/run/fetch-names': {
      if (isActive(run)) return { ok: false, error: 'Hãy dừng lượt chạy trước.' };
      if (fetchingNames) return { ok: false, error: 'Đang lấy tên nhóm.' };
      void fetchGroupNames(); // runs in the background; the UI watches storage
      return { ok: true };
    }
    case 'cap/run/reset': {
      if (isActive(run)) return { ok: false, error: 'Hãy dừng lượt chạy trước.' };
      await runItem.setValue(IDLE_RUN);
      return { ok: true };
    }
  }
}

function validateCampaign(c: Campaign): string | null {
  if (c.groupIds.length === 0) return 'Hãy chọn ít nhất một nhóm.';
  if (c.groupIds.length > LIMITS.maxGroupsPerCampaign) return `Mỗi chiến dịch tối đa ${LIMITS.maxGroupsPerCampaign} nhóm.`;
  if (c.mode === 'comment' && (!Number.isInteger(c.commentsPerGroup) || (c.commentsPerGroup ?? 0) < 1 || (c.commentsPerGroup ?? 0) > LIMITS.maxCommentsPerGroup)) return 'Số bài mỗi nhóm không hợp lệ.';
  if (!c.variations.some((v) => v.trim())) return 'Hãy viết nội dung bài đăng trước.';
  if (c.variations.some((v) => v.length > LIMITS.maxPostLength)) return 'Bài đăng quá dài.';
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
    const campaign = await currentCampaign(run);
    const groupId = run.queue[0];
    if (!campaign || !groupId) {
      await runItem.setValue({ ...run, status: 'halted', reason: 'Thiếu chiến dịch hoặc nhóm.', nextAt: null });
      return;
    }
    const group = (await groupsItem.getValue()).find((g) => g.id === groupId);
    const text = pickVariation(campaign.variations, run.attempted);

    const outcome: PostOutcome = group
      ? campaign.mode === 'comment' ? await commentInGroup(group, text, run) : await postToGroup(group, text)
      : { kind: 'skipped', reason: 'Nhóm đã bị xóa.' };

    // The name may have just been read from the page, so log with the stored group.
    const logGroup = (await groupsItem.getValue()).find((g) => g.id === groupId) ?? group ?? null;

    // The user may have pressed Stop/Pause while we were posting; honour that.
    const latest = await runItem.getValue();
    if (latest.status !== 'running') {
      await log(campaign.id, logGroup, toStatus(outcome), describe(outcome, campaign.mode));
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
    if (state.status === 'halted') await disableAllSchedules(campaign.id);
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
      iconUrl: browser.runtime.getURL('/icon-128.png'),
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

async function postToGroup(group: Group, text: string): Promise<PostOutcome> {
  let tabId: number | undefined;
  // Until the page has loaded nothing can have been submitted, so a failure up to that point is safe to retry.
  let loaded = false;
  try {
    const tab = await browser.tabs.create({ url: group.url, active: false });
    tabId = tab.id;
    if (tabId === undefined) return { kind: 'failed', reason: 'Không mở được tab.', retryable: true };
    await waitForTab(tabId);
    loaded = true;
    if (hasPlaceholderName(group)) {
      const found = await askGroupName(tabId);
      if (found.name) await saveGroupName(group.id, found.name);
    }
    const request: PostRequest = { type: 'cap/post', text };
    const reply = (await withTimeout(
      sendWithRetry(tabId, request),
      LIMITS.postTimeoutMs,
      'Hết thời gian chờ khi đăng bài.',
    )) as PostReply;
    return reply;
  } catch (e) {
    return { kind: 'failed', reason: e instanceof Error ? e.message : String(e), ...(loaded ? {} : { retryable: true }) };
  } finally {
    if (tabId !== undefined) await browser.tabs.remove(tabId).catch(() => undefined);
  }
}

async function commentInGroup(group: Group, text: string, run: RunState): Promise<PostOutcome> {
  let tabId: number | undefined;
  try {
    const slot = `slot:${run.campaignId}:${run.startedAt}:${run.attempted}`;
    const history = Object.fromEntries(Object.entries(await commentedPostsItem.getValue()).filter(([key, at]) => !key.startsWith('slot:') || at > Date.now() - 7 * 86400_000));
    if (history[slot]) return { kind: 'skipped', reason: 'Lượt bình luận đã được xử lý trước khi gián đoạn.' };
    const tab = await browser.tabs.create({ url: recentActivityGroupUrl(group.id), active: false });
    tabId = tab.id;
    if (tabId === undefined) return { kind: 'failed', reason: 'Không mở được tab.' };
    await waitForTab(tabId);
    const request: DiscoverRequest = { type: 'cap/discover-posts', groupId: group.id };
    const found = (await sendWithRetry(tabId, request)) as DiscoverReply;
    if (found.problem) return found.problem;
    const url = found.urls.find((candidate) => !history[candidate]);
    if (!url) return { kind: 'skipped', skipRemainingGroup: true, reason: found.urls.length > 0
      ? `Tìm thấy ${found.urls.length} bài trong 24 giờ, nhưng tất cả đã được thử trước đó.`
      : `Không xác định được bài phù hợp trong 24 giờ. ${found.diagnostic ?? ''}`.trim() };
    const latest = await runItem.getValue();
    if (latest.status !== 'running' || latest.startedAt !== run.startedAt || latest.attempted !== run.attempted) return { kind: 'skipped', reason: 'Lượt chạy đã thay đổi.' };
    // Reserve both the post and this run slot before opening the editor: uncertain outcomes are never retried automatically.
    const now = Date.now();
    await commentedPostsItem.setValue({ ...history, [url]: now, [slot]: now });
    await browser.tabs.update(tabId, { url });
    await waitForTab(tabId);
    await sendWithRetry(tabId, { type: 'cap/group-name' });
    const beforeSubmit = await runItem.getValue();
    if (beforeSubmit.status !== 'running' || beforeSubmit.startedAt !== run.startedAt || beforeSubmit.attempted !== run.attempted) return { kind: 'skipped', reason: 'Lượt chạy đã thay đổi.' };
    const comment: CommentRequest = { type: 'cap/comment', text };
    return (await withTimeout(browser.tabs.sendMessage(tabId, comment), LIMITS.postTimeoutMs, 'Hết thời gian chờ bình luận.')) as PostOutcome;
  } catch (e) {
    return { kind: 'failed', reason: e instanceof Error ? e.message : String(e) };
  } finally {
    if (tabId !== undefined) await browser.tabs.remove(tabId).catch(() => undefined);
  }
}

function waitForTab(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Trang nhóm tải quá lâu.')), LIMITS.tabLoadTimeoutMs);
    const onUpdated = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === 'complete') done();
    };
    function done(err?: Error) {
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(onUpdated);
      err ? reject(err) : resolve();
    }
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.get(tabId).then((t) => t.status === 'complete' && done()).catch(() => done(new Error('Tab đã bị đóng.')));
  });
}

/** The content script may not be ready the instant the tab reports complete. */
async function sendWithRetry(tabId: number, msg: PostRequest | GroupNameRequest | DiscoverRequest | CommentRequest): Promise<unknown> {
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
  o.kind === 'posted' ? 'posted' : o.kind === 'pending' ? 'pending' : o.kind === 'skipped' ? 'skipped' : 'failed';

const describe = (o: PostOutcome, mode?: Campaign['mode']): string => {
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
