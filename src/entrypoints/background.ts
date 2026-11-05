import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { LIMITS } from '@/lib/limits';
import { isRunCommand, type CommandReply, type PostReply, type PostRequest, type RunCommand } from '@/lib/messages';
import { applyOutcome, createRun, IDLE_RUN, isActive, pause, pickVariation, resume, stop } from '@/lib/run-engine';
import { appendLog, campaignsItem, groupsItem, runItem } from '@/lib/storage';
import { newId } from '@/lib/id';
import type { Campaign, Group, LogStatus, PostOutcome, RunState } from '@/lib/types';

const ALARM = 'cap-next-post';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (r: CommandReply) => void) => {
    if (!isRunCommand(message)) return false;
    handleCommand(message).then(sendResponse, (e: unknown) => sendResponse({ ok: false, error: String(e) }));
    return true; // async response
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void runStep();
  });

  // The service worker can be restarted at any time; rebuild the timer from stored state.
  void restoreSchedule();
});

async function restoreSchedule(): Promise<void> {
  const run = await runItem.getValue();
  if (run.status === 'running' && run.nextAt !== null) await schedule(run.nextAt);
}

async function schedule(at: number | null): Promise<void> {
  await browser.alarms.clear(ALARM);
  if (at !== null) await browser.alarms.create(ALARM, { when: Math.max(at, Date.now() + 1000) });
}

async function handleCommand(cmd: RunCommand): Promise<CommandReply> {
  const run = await runItem.getValue();
  switch (cmd.type) {
    case 'cap/run/start': {
      if (isActive(run)) return { ok: false, error: 'Đang có một lượt chạy khác.' };
      const campaign = (await campaignsItem.getValue()).find((c) => c.id === cmd.campaignId);
      if (!campaign) return { ok: false, error: 'Không tìm thấy chiến dịch.' };
      const problem = validateCampaign(campaign);
      if (problem) return { ok: false, error: problem };
      const state = createRun(campaign, Date.now());
      await runItem.setValue(state);
      await log(campaign.id, null, 'info', `Đã bắt đầu chạy: ${state.total} nhóm.`);
      void runStep(); // first post goes out immediately
      return { ok: true };
    }
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
    case 'cap/run/stop': {
      await runItem.setValue(stop(run));
      await schedule(null);
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
  if (c.groupIds.length > LIMITS.maxGroupsPerCampaign) return `Maximum ${LIMITS.maxGroupsPerCampaign} groups per campaign.`;
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
      ? await postToGroup(group, text)
      : { kind: 'skipped', reason: 'Nhóm đã bị xóa.' };

    // The user may have pressed Stop/Pause while we were posting; honour that.
    const latest = await runItem.getValue();
    if (latest.status !== 'running') {
      await log(campaign.id, group ?? null, toStatus(outcome), describe(outcome));
      return;
    }

    const { state, breakMinutes } = applyOutcome(latest, campaign, outcome, Date.now());
    await log(campaign.id, group ?? null, toStatus(outcome), describe(outcome));
    if (breakMinutes !== null) await log(campaign.id, null, 'break', `Nghỉ an toàn: ${breakMinutes} phút.`);
    if (state.status === 'done') await log(campaign.id, null, 'info', 'Đã chạy xong.');
    if (state.status === 'halted' || state.status === 'paused') await log(campaign.id, null, 'info', state.reason ?? '');
    await runItem.setValue(state);
    await schedule(state.status === 'running' ? state.nextAt : null);
  } finally {
    stepping = false;
  }
}

async function postToGroup(group: Group, text: string): Promise<PostOutcome> {
  let tabId: number | undefined;
  try {
    const tab = await browser.tabs.create({ url: group.url, active: false });
    tabId = tab.id;
    if (tabId === undefined) return { kind: 'failed', reason: 'Không mở được tab.' };
    await waitForTab(tabId);
    const request: PostRequest = { type: 'cap/post', text };
    const reply = (await withTimeout(
      sendWithRetry(tabId, request),
      LIMITS.postTimeoutMs,
      'Hết thời gian chờ khi đăng bài.',
    )) as PostReply;
    return reply;
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
async function sendWithRetry(tabId: number, msg: PostRequest): Promise<unknown> {
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
  o.kind === 'posted' ? 'posted' : o.kind === 'skipped' ? 'skipped' : 'failed';

const describe = (o: PostOutcome): string => (o.kind === 'posted' ? 'Đã gửi bài đăng.' : o.reason);

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
