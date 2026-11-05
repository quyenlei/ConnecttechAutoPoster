import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import {
  detectPageProblem,
  findComposerTrigger,
  findDialogTextbox,
  findJoinButton,
  findPostButton,
  isEnabled,
  readGroupName,
  waitFor,
} from '@/lib/fb-dom';
import { isGroupNameRequest, isPostRequest, type GroupNameReply } from '@/lib/messages';
import type { PostOutcome } from '@/lib/types';

export default defineContentScript({
  matches: ['*://*.facebook.com/groups/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (o: PostOutcome | GroupNameReply) => void) => {
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

/** Drives the visible composer exactly like a person would: open, type, press Post. */
async function submitPost(text: string): Promise<PostOutcome> {
  if (!text.trim()) return { kind: 'failed', reason: 'Bài đăng đang trống.' };

  const early = detectPageProblem(document, location.pathname);
  if (early) return early.kind === 'fatal' ? { kind: 'fatal', reason: early.reason } : { kind: 'skipped', reason: early.reason };

  const trigger = await waitFor(() => findComposerTrigger(document), 15_000);
  if (!trigger) {
    if (findJoinButton(document)) return { kind: 'skipped', reason: 'Bạn chưa là thành viên của nhóm này.' };
    return { kind: 'failed', reason: 'Không tìm thấy ô đăng bài. Có thể Facebook đã đổi giao diện.' };
  }
  // The first click can be lost if the page has not finished hydrating, so retry while no dialog is open.
  let textbox: HTMLElement | null = null;
  for (let attempt = 0; attempt < 3 && !textbox; attempt++) {
    const target = attempt === 0 ? trigger : findComposerTrigger(document);
    if (!target) break;
    target.click();
    textbox = await waitFor(() => findDialogTextbox(document), 6_000);
  }
  if (!textbox) return { kind: 'failed', reason: 'Hộp thoại đăng bài không mở.' };
  textbox.focus();
  await pause(400);
  document.execCommand('insertText', false, text);
  await pause(600);
  if (!(textbox.textContent ?? '').trim()) return { kind: 'failed', reason: 'Không nhập được nội dung vào ô đăng bài.' };

  const button = await waitFor(() => {
    const b = findPostButton(document);
    return b && isEnabled(b) ? b : null;
  }, 10_000);
  if (!button) {
    const reason = findPostButton(document) ? 'Nút Đăng đang bị vô hiệu hóa (Facebook chưa nhận nội dung).' : 'Không tìm thấy nút Đăng.';
    return { kind: 'failed', reason };
  }
  button.click();

  // Success = the dialog closes. A blocked/limited warning may appear instead.
  const closed = await waitFor(() => !document.querySelector('[role="dialog"] [role="textbox"]'), 20_000, 500);
  const late = detectPageProblem(document, location.pathname);
  if (late?.kind === 'fatal') return { kind: 'fatal', reason: late.reason };
  return closed ? { kind: 'posted' } : { kind: 'failed', reason: 'Facebook không xác nhận bài đăng.' };
}
