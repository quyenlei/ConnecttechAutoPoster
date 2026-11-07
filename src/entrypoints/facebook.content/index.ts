import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import {
  detectPageProblem,
  detectPendingApproval,
  findComposerTrigger,
  findDialogTextbox,
  findJoinButton,
  describeDialogState,
  findPostButton,
  findRecentGroupPosts,
  findCommentTextbox,
  findCommentButton,
  countCommentEditors,
  countVisibleCommentText,
  isComposerSubmitted,
  isEnabled,
  readGroupName,
  waitFor,
} from '@/lib/fb-dom';
import { isGroupNameRequest, isPostRequest, type GroupNameReply, type DiscoverReply } from '@/lib/messages';
import type { PostOutcome } from '@/lib/types';

export default defineContentScript({
  matches: ['*://*.facebook.com/groups/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (o: PostOutcome | GroupNameReply | DiscoverReply) => void) => {
      if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'cap/discover-posts' && 'groupId' in message && typeof message.groupId === 'string') {
        discoverPosts(message.groupId).then(sendResponse, () => sendResponse({ urls: [], problem: { kind: 'failed', reason: 'Không thể quét bài viết trong nhóm.' } }));
        return true;
      }
      if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'cap/comment' && 'text' in message && typeof message.text === 'string') {
        submitComment(message.text).then(sendResponse, (e: unknown) => sendResponse({ kind: 'failed', reason: e instanceof Error ? e.message : String(e) }));
        return true;
      }
      if (isGroupNameRequest(message)) {
        readName().then(sendResponse, () => sendResponse({ name: null }));
        return true;
      }
      if (!isPostRequest(message)) return false;
      submitPost(message.text).then(sendResponse, (e: unknown) =>
        sendResponse({ kind: 'failed', reason: e instanceof Error ? e.message : String(e) }),
      );
      return true;
    });
  },
});

/** Read-only: no clicks, no typing. Reports a checkpoint so the caller can stop. */
async function readName(): Promise<GroupNameReply> {
  const problem = detectPageProblem(document, location.pathname);
  if (problem?.kind === 'fatal') return { name: null, fatal: problem.reason };
  return { name: await waitFor(() => readGroupName(document), 8_000) };
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Read-only scan. The feed may load asynchronously and need scrolling to reveal more posts. */
async function discoverPosts(groupId: string): Promise<DiscoverReply> {
  const found = new Map<string, number>();
  let maxArticles = 0;
  let maxDates = 0;
  let maxEditors = 0;
  await waitFor(() => document.querySelector('[role="article"], article') || countCommentEditors(document) > 0 || detectPageProblem(document, location.pathname) || findJoinButton(document), 10_000);
  for (let pass = 0; pass < 5; pass++) {
    const problem = detectPageProblem(document, location.pathname);
    if (problem) return { urls: [], problem: { kind: problem.kind === 'fatal' ? 'fatal' : 'skipped', reason: problem.reason } };
    if (findJoinButton(document)) return { urls: [], problem: { kind: 'skipped', reason: 'Bạn chưa là thành viên của nhóm này.' } };
    maxArticles = Math.max(maxArticles, document.querySelectorAll('[role="article"], article').length);
    maxDates = Math.max(maxDates, document.querySelectorAll('[role="article"] time[datetime], article time[datetime]').length);
    maxEditors = Math.max(maxEditors, countCommentEditors(document));
    for (const post of findRecentGroupPosts(document, groupId, Date.now())) found.set(post.url, post.postedAt);
    if (pass < 4) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await pause(2_000);
    }
  }
  if (found.size === 0 && maxEditors > 0 && maxArticles === 0) {
    return { urls: [], problem: { kind: 'failed', reason: `Phát hiện tối đa ${maxEditors} ô bình luận, nhưng không xác định được bài viết và thời gian đăng từ DOM Facebook.` } };
  }
  return {
    urls: [...found].sort((a, b) => b[1] - a[1]).slice(0, 500).map(([url]) => url),
    diagnostic: `Đã quét tối đa ${maxArticles} phần tử bài viết, ${maxDates} thẻ time; bộ quét cũng kiểm tra thời gian trên liên kết bài.`,
  };
}

async function submitComment(text: string): Promise<PostOutcome> {
  const problem = detectPageProblem(document, location.pathname);
  if (problem) return { kind: problem.kind === 'fatal' ? 'fatal' : 'skipped', reason: problem.reason };
  if (!text.trim()) return { kind: 'failed', reason: 'Bình luận đang trống.' };
  const textbox = await waitFor(() => findCommentTextbox(document), 15_000);
  if (!textbox) return { kind: 'failed', reason: 'Không xác định được duy nhất một ô bình luận trên trang bài viết.' };
  textbox.focus();
  document.execCommand('insertText', false, text);
  await pause(600);
  if ((textbox.textContent ?? '').trim() !== text.trim()) return { kind: 'failed', reason: 'Không thể nhập nội dung bình luận.' };
  const button = await waitFor(() => findCommentButton(textbox), 5_000);
  if (!button || !isEnabled(button)) return { kind: 'failed', reason: 'Không tìm thấy nút gửi đang bật trong form bình luận sau khi nhập.' };
  const before = countVisibleCommentText(document, text);
  button.click();
  const confirmed = await waitFor(() => !(textbox.textContent ?? '').trim() && countVisibleCommentText(document, text) > before, 20_000, 500);
  const late = detectPageProblem(document, location.pathname);
  if (late?.kind === 'fatal') return { kind: 'fatal', reason: late.reason };
  return confirmed ? { kind: 'posted' } : { kind: 'failed', reason: 'Đã gửi thao tác bình luận nhưng chưa thấy bình luận mới trên trang; hãy kiểm tra trước khi thử lại.' };
}

/** Drives the visible composer exactly like a person would: open, type, press Post. */
async function submitPost(text: string): Promise<PostOutcome> {
  if (!text.trim()) return { kind: 'failed', reason: 'Bài đăng đang trống.' };

  const early = detectPageProblem(document, location.pathname);
  if (early) return early.kind === 'fatal' ? { kind: 'fatal', reason: early.reason } : { kind: 'skipped', reason: early.reason };

  const trigger = await waitFor(() => findComposerTrigger(document), 15_000);
  if (!trigger) {
    if (findJoinButton(document)) return { kind: 'skipped', reason: 'Bạn chưa là thành viên của nhóm này.' };
    return { kind: 'failed', reason: 'Không tìm thấy ô đăng bài. Có thể Facebook đã đổi giao diện.', retryable: true };
  }
  // The first click can be lost if the page has not finished hydrating, so retry while no dialog is open.
  let textbox: HTMLElement | null = null;
  for (let attempt = 0; attempt < 3 && !textbox; attempt++) {
    const target = attempt === 0 ? trigger : findComposerTrigger(document);
    if (!target) break;
    target.click();
    textbox = await waitFor(() => findDialogTextbox(document), 6_000);
  }
  if (!textbox) return { kind: 'failed', reason: 'Hộp thoại đăng bài không mở.', retryable: true };
  textbox.focus();
  await pause(400);
  document.execCommand('insertText', false, text);
  await pause(600);
  if (!(textbox.textContent ?? '').trim()) return { kind: 'failed', reason: 'Không nhập được nội dung vào ô đăng bài.', retryable: true };

  const button = await waitFor(() => {
    const b = findPostButton(document);
    return b && isEnabled(b) ? b : null;
  }, 10_000);
  if (!button) {
    const reason = findPostButton(document) ? 'Nút Đăng đang bị vô hiệu hóa (Facebook chưa nhận nội dung).' : 'Không tìm thấy nút Đăng.';
    return { kind: 'failed', reason, retryable: true };
  }
  // Admins may see an approval notice all the time, so only a notice that appears after Post counts.
  const pendingBefore = detectPendingApproval(document);
  button.click();

  // Success = the dialog closes or its textbox is emptied. A blocked/limited warning may appear instead.
  const closed = await waitFor(() => isComposerSubmitted(document), 30_000, 500);
  const late = detectPageProblem(document, location.pathname);
  if (late?.kind === 'fatal') return { kind: 'fatal', reason: late.reason };
  if (closed && !pendingBefore && (await waitFor(() => detectPendingApproval(document), 4_000))) return { kind: 'pending' };
  return closed ? { kind: 'posted' } : { kind: 'failed', reason: `Facebook không xác nhận bài đăng (${describeDialogState(document)}).` };
}
