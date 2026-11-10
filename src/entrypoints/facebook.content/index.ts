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
  findCommentButton,
  describeCommentButtons,
  pressEnter,
  pressEscape,
  countComposerImages,
  findImageInput,
  findLinkPreviewCloseButton,
  findPhotoButton,
  hasLineBreaks,
  insertLines,
  isDuplicatedText,
  keptLineBreaks,
  pasteText,
  isComposerBusy,
  setInputFiles,
  countVisibleCommentText,
  isComposerSubmitted,
  isEnabled,
  readGroupName,
  waitFor,
  findFeedItems,
  isFeedItemRendered,
  readFeedPost,
  readStructuredPostTimes,
  findMyName,
  findTimestampTargets,
  hoverOver,
  hoverOut,
  findItemEditor,
  findItemCommentAction,
  findDialogCommentEditor,
  type FeedPost,
} from '@/lib/fb-dom';
import { commentKeys, describeScan, emptyCounts, feedIsExhausted, judgeFeedPost, type FeedCandidate, type SkipReason } from '@/lib/comment-pick';
import { dataUrlToBytes } from '@/lib/images';
import { LIMITS } from '@/lib/limits';
import { isFeedCommentRequest, isFeedPickRequest, isGroupNameRequest, isPostRequest, type FeedCommentRequest, type FeedPickReply, type FeedPickRequest, type GroupNameReply, type PostRequest } from '@/lib/messages';
import type { PostOutcome } from '@/lib/types';

export default defineContentScript({
  matches: ['*://*.facebook.com/groups/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (o: PostOutcome | GroupNameReply | FeedPickReply) => void) => {
      if (isFeedPickRequest(message)) {
        pickFeedPost(message).then(sendResponse, () => sendResponse({ problem: { kind: 'failed', reason: 'Không thể quét bài viết trong feed.' } }));
        return true;
      }
      if (isFeedCommentRequest(message)) {
        commentOnPickedPost(message).then(sendResponse, (e: unknown) => sendResponse({ kind: 'failed', reason: e instanceof Error ? e.message : String(e) }));
        return true;
      }
      if (isGroupNameRequest(message)) {
        readName().then(sendResponse, () => sendResponse({ name: null }));
        return true;
      }
      if (!isPostRequest(message)) return false;
      submitPost(message).then(sendResponse, (e: unknown) =>
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

const asCandidate = (post: FeedPost): FeedCandidate => ({
  fingerprint: post.fingerprint,
  url: post.url,
  age: post.age,
  mine: post.mine,
  canComment: post.editor !== null || post.commentAction !== null,
});

/** The post chosen by the last scan. It stays in this page so the comment goes to exactly that element. */
let picked: { fingerprint: string; post: FeedPost } | null = null;
/** Items whose post time was already looked for by hovering, so a later scan of the same page does not repeat it. */
const hovered = new WeakSet<HTMLElement>();

/** Scrolls to the end of the loaded feed and waits for Facebook to append more posts. */
async function loadMore(count: number): Promise<boolean> {
  window.scrollTo(0, document.documentElement.scrollHeight);
  return (await waitFor(() => findFeedItems(document).length > count, LIMITS.feedRenderWaitMs * 2, 250)) !== null;
}

/**
 * Facebook shows the post time and link only while the pointer is over the time label. Hover each likely
 * label of the post header once, read the post again, and leave. Nothing is clicked.
 */
async function revealTime(item: HTMLElement, read: () => FeedPost): Promise<FeedPost> {
  hovered.add(item);
  for (const target of findTimestampTargets(item)) {
    hoverOver(target);
    const found = await waitFor(() => {
      const post = read();
      return post.age || post.url ? post : null;
    }, LIMITS.hoverWaitMs, 150);
    hoverOut(target);
    if (found) return found;
  }
  return read();
}

/**
 * Walks the group feed from the top, one post at a time: brings each into view (Facebook renders posts only
 * near the viewport), reads it, and scrolls to load more when the loaded ones run out. Stops at the first
 * post that can be commented, or when the limits in `LIMITS` are reached. Nothing is typed here.
 */
async function pickFeedPost(request: FeedPickRequest): Promise<FeedPickReply> {
  picked = null;
  const deadline = Date.now() + LIMITS.feedScanTimeoutMs;
  await waitFor(() => findFeedItems(document).length > 0 || detectPageProblem(document, location.pathname) || findJoinButton(document), 15_000);
  const problem = detectPageProblem(document, location.pathname);
  if (problem) return { problem: { kind: problem.kind === 'fatal' ? 'fatal' : 'skipped', reason: problem.reason } };
  if (findFeedItems(document).length === 0) {
    if (findJoinButton(document)) return { problem: { kind: 'skipped', reason: 'Bạn chưa là thành viên của nhóm này.' } };
    return { problem: { kind: 'failed', reason: 'Không thấy danh sách bài viết của nhóm (có thể Facebook đã đổi giao diện).' } };
  }
  const tried = new Set(request.tried);
  const structured = readStructuredPostTimes(document, request.groupId);
  const limit = request.mode === 'newest' ? LIMITS.newestFeedWindow : LIMITS.feedScanMaxPosts;
  const counts = emptyCounts();
  const reasons: (SkipReason | null)[] = [];
  const trace: string[] = [];
  let myName: string | null = null;
  let seen = 0;
  let index = 0;
  let timedOut = false;
  while (seen < limit) {
    if (Date.now() > deadline) { timedOut = true; break; }
    const items = findFeedItems(document);
    const item = items[index];
    if (!item) {
      if (!(await loadMore(items.length))) break;
      continue;
    }
    index++;
    item.scrollIntoView({ block: 'center' });
    if (!(await waitFor(() => isFeedItemRendered(item), LIMITS.feedRenderWaitMs, 200))) {
      trace.push(`#${index - 1}:chưa hiển thị`);
      continue;
    }
    myName ??= findMyName(document);
    const read = () => readFeedPost(item, { groupId: request.groupId, now: Date.now(), myName, ownTexts: request.ownTexts, structured });
    let post = read();
    // Banners and section headers in the feed have neither text nor a way to comment.
    if (!post.fingerprint && !post.url && !post.editor && !post.commentAction) continue;
    seen++;
    let reason = judgeFeedPost(asCandidate(post), request.mode, tried, request.groupId);
    if (!post.age && !hovered.has(item) && (reason === 'age-unknown' || reason === null)) {
      post = await revealTime(item, read);
      reason = judgeFeedPost(asCandidate(post), request.mode, tried, request.groupId);
    }
    reasons.push(reason);
    trace.push(`#${index - 1}:${post.fingerprint ?? '-'}:${reason ?? 'ok'}:${post.age?.label ?? '?'}`);
    const id = post.fingerprint ?? post.url;
    if (reason === null && id) {
      picked = { fingerprint: id, post };
      const age = post.age ? `, đăng khoảng ${Math.max(1, Math.round(post.age.minAgeMs / 60_000))} phút trước${post.age.label ? ` (nhãn: "${post.age.label}")` : ''}` : ', không rõ giờ đăng';
      return { fingerprint: id, keys: commentKeys(request.groupId, post), trace, diagnostic: `Chọn bài thứ ${seen} trong feed${age}.` };
    }
    counts[reason ?? 'unidentified']++;
    if (request.mode === 'recent' && feedIsExhausted(reasons)) break;
  }
  const notes = [
    timedOut ? 'Hết thời gian quét.' : '',
    document.visibilityState === 'hidden' ? 'Cửa sổ bình luận đang bị ẩn hoặc thu nhỏ nên Facebook có thể không tải bài; hãy để cửa sổ đó hiển thị.' : '',
  ].filter(Boolean);
  return { trace, diagnostic: [describeScan(counts, seen), ...notes].join(' ') };
}

/** Comments on the post chosen by the last scan. Opens its editor with the post's own "Bình luận" button when needed. */
async function commentOnPickedPost(request: FeedCommentRequest): Promise<PostOutcome> {
  const choice = picked;
  picked = null;
  // Nothing was typed in any of the early returns below, so they are safe to release (`retryable`).
  if (!choice || choice.fingerprint !== request.fingerprint || !choice.post.element.isConnected) {
    return { kind: 'failed', reason: 'Bài đã chọn trong feed không còn trên trang.', retryable: true };
  }
  const problem = detectPageProblem(document, location.pathname);
  if (problem) return { kind: problem.kind === 'fatal' ? 'fatal' : 'skipped', reason: problem.reason };
  if (!request.text.trim()) return { kind: 'failed', reason: 'Bình luận đang trống.' };
  const item = choice.post.element;
  item.scrollIntoView({ block: 'center' });
  let editor = findItemEditor(item);
  let scope: ParentNode = item;
  let inDialog = false;
  if (!editor) {
    const action = findItemCommentAction(item);
    if (!action) return { kind: 'failed', reason: 'Bài không có ô bình luận.', retryable: true };
    action.click();
    editor = await waitFor(() => findItemEditor(item) ?? findDialogCommentEditor(document), 6_000);
    const dialog = editor && !item.contains(editor) ? editor.closest('[role="dialog"]') : null;
    if (dialog) { scope = dialog; inDialog = true; }
  }
  if (!editor) return { kind: 'failed', reason: 'Đã bấm "Bình luận" nhưng không thấy ô bình luận.', retryable: true };
  const outcome = await typeAndSendComment(editor, scope, request.text);
  if (inDialog) pressEscape(document.activeElement instanceof HTMLElement ? document.activeElement : document.body);
  return outcome;
}

/** Types the comment, sends it and waits until it shows up inside `scope`. */
async function typeAndSendComment(textbox: HTMLElement, scope: ParentNode, text: string): Promise<PostOutcome> {
  // Feed editors are lazy: a click activates the editor before it accepts input. Nothing is sent yet,
  // so trying paste and then typed lines (never clearing the box) is safe.
  textbox.scrollIntoView({ block: 'center' });
  textbox.click();
  textbox.focus();
  await pause(500);
  const typed = () => (textbox.textContent ?? '').trim();
  if (hasLineBreaks(text)) {
    pasteText(textbox, text);
    await pause(600);
  }
  if (!typed()) {
    textbox.focus();
    insertLines((command, value) => document.execCommand(command, false, value), text);
    await pause(600);
  }
  if (!typed()) pasteText(textbox, text);
  await pause(300);
  if (!typed()) return { kind: 'failed', reason: 'Không thể nhập nội dung bình luận (ô bình luận không nhận chữ).', retryable: true };
  if (isDuplicatedText(textbox.textContent ?? '', text)) return { kind: 'failed', reason: 'Nội dung trong ô bình luận bị lặp, chưa gửi.', retryable: true };
  // Feed comment forms have no send button: Facebook submits them with Enter. A real send button is still used when present.
  const button = await waitFor(() => findCommentButton(textbox), 2_000);
  if (button && !isEnabled(button)) return { kind: 'failed', reason: `Nút gửi bình luận đang tắt (${describeCommentButtons(textbox)}).`, retryable: true };
  const before = countVisibleCommentText(scope, text);
  if (button) button.click();
  else {
    // Enter is sometimes ignored. Press it again only while the text is still in the box: a box that was
    // emptied means the comment went out, so a repeat can never send it twice.
    for (let press = 0; press < 3 && typed(); press++) {
      textbox.focus();
      pressEnter(textbox);
      await waitFor(() => !typed(), 4_000, 250);
    }
  }
  const confirmed = await waitFor(() => !(textbox.textContent ?? '').trim() && countVisibleCommentText(scope, text) > before, 20_000, 500);
  const late = detectPageProblem(document, location.pathname);
  if (late?.kind === 'fatal') return { kind: 'fatal', reason: late.reason };
  return confirmed ? { kind: 'posted' } : { kind: 'failed', reason: 'Đã gửi thao tác bình luận nhưng chưa thấy bình luận mới trên trang; hãy kiểm tra trước khi thử lại.' };
}

/**
 * Adds the campaign images through the composer's own file input.
 * A post with chosen images is never sent without them.
 */
async function attachImages(images: NonNullable<PostRequest['images']>): Promise<PostOutcome | null> {
  const files: File[] = [];
  for (const image of images) {
    const bytes = dataUrlToBytes(image.dataUrl);
    if (!bytes) return { kind: 'failed', reason: 'Dữ liệu ảnh không hợp lệ, bài chưa được đăng.' };
    files.push(new File([bytes as BlobPart], image.name, { type: image.mime }));
  }
  let input = findImageInput(document);
  if (!input) {
    findPhotoButton(document)?.click();
    input = await waitFor(() => findImageInput(document), 5_000);
  }
  if (!input) return { kind: 'failed', reason: 'Không tìm thấy ô nhận ảnh trong hộp soạn thảo, bài chưa được đăng.', retryable: true };
  const before = countComposerImages(document);
  if (!setInputFiles(input, files)) return { kind: 'failed', reason: 'Không đính được ảnh vào bài, bài chưa được đăng.', retryable: true };
  const ready = await waitFor(() => countComposerImages(document) - before >= files.length && !isComposerBusy(document), LIMITS.imageUploadTimeoutMs, 500);
  if (!ready) return { kind: 'failed', reason: 'Ảnh chưa tải xong trong hộp soạn thảo, bài chưa được đăng.', retryable: true };
  return null;
}

/** Waits once for the preview card and closes it. No card is not an error. */
async function closeLinkPreview(): Promise<void> {
  const button = await waitFor(() => findLinkPreviewCloseButton(document), LIMITS.linkPreviewWaitMs, 500);
  if (!button) return;
  button.click();
  await waitFor(() => !findLinkPreviewCloseButton(document), 3_000, 250);
}

/** Drives the visible composer exactly like a person would: open, type, press Post. */
async function submitPost(request: PostRequest): Promise<PostOutcome> {
  const { text } = request;
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
  // Multi-line text is pasted as plain text: typing "Enter" is ignored by Facebook's editor, and an earlier
  // type-then-clear fallback left both copies in the box. Only when the paste did nothing (box still
  // empty) is the text typed line by line. The box is never cleared and filled again.
  if (hasLineBreaks(text)) {
    pasteText(textbox, text);
    await pause(600);
  }
  if (!(textbox.textContent ?? '').trim()) {
    insertLines((command, value) => document.execCommand(command, false, value), text);
    await pause(600);
  }
  if (!(textbox.textContent ?? '').trim()) return { kind: 'failed', reason: 'Không nhập được nội dung vào ô đăng bài.', retryable: true };
  // Nothing has been submitted yet, so both failures below are safe to retry in a fresh composer.
  if (isDuplicatedText(textbox.textContent ?? '', text)) return { kind: 'failed', reason: 'Nội dung trong ô đăng bài bị lặp, bài chưa được đăng.', retryable: true };
  if (!keptLineBreaks(textbox, text)) return { kind: 'failed', reason: 'Facebook không giữ được xuống dòng trong bài, bài chưa được đăng.', retryable: true };

  // Nothing has been submitted before Post is clicked, so failures up to there are safe to retry.
  if (request.images?.length) {
    const failure = await attachImages(request.images);
    if (failure) return failure;
  }
  if (request.removeLinkPreview) await closeLinkPreview();

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
