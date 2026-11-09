/**
 * Facebook DOM helpers. Facebook changes its markup often and has no public API
 * for group posting, so every selector lives here, in one place, with text hints
 * in English and Vietnamese. When Facebook changes, update this file and its tests.
 */

/** Lowercase + NFC so Vietnamese text matches whichever Unicode form Facebook renders. */
const lower = (s: string | null | undefined): string => (s ?? '').trim().normalize('NFC').toLowerCase();

export const HINTS = {
  composer: [
    'write something',
    'create a public post',
    'bạn viết gì đi',
    'viết gì đó',
    'tạo bài viết công khai',
    'tạo bài viết',
  ],
  post: ['post', 'đăng'],
  /** Button in the composer that adds photos. Unverified on live Facebook. */
  photo: ['photo/video', 'ảnh/video', 'photo', 'ảnh'],
  /** Close button of the link preview card in the composer. Unverified on live Facebook. */
  removePreview: ['remove preview', 'xóa bản xem trước', 'gỡ bản xem trước', 'xóa xem trước'],
  join: ['join group', 'tham gia nhóm', 'tham gia'],
  blocked: [
    "you're temporarily blocked",
    'you’re temporarily blocked',
    'we limit how often you can post',
    'bạn tạm thời bị chặn',
    'chúng tôi hạn chế tần suất',
    'chúng tôi hạn chế số lần',
    'bạn đang bị hạn chế đăng',
  ],
  /** Shown after posting in a group where admins approve posts first. Unverified on live Facebook. */
  pending: [
    'pending approval',
    'awaiting approval',
    'waiting for approval',
    'đang chờ phê duyệt',
    'đang chờ duyệt',
    'chờ phê duyệt',
    'chờ quản trị viên phê duyệt',
  ],
  cannotPost: [
    'only admins can post',
    'chỉ quản trị viên mới có thể đăng',
    'chỉ quản trị viên mới được đăng',
    'bạn không thể đăng trong nhóm này',
    'bạn không thể đăng bài trong nhóm này',
    'you can’t post in this group',
    "you can't post in this group",
  ],
} as const;

export type PageProblem = { kind: 'fatal' | 'skip'; reason: string } | null;

/** Looks for a checkpoint, rate limit warning or a group we cannot post to. */
export function detectPageProblem(doc: Document, pathname: string): PageProblem {
  if (pathname.startsWith('/checkpoint')) {
    return { kind: 'fatal', reason: 'Facebook yêu cầu kiểm tra bảo mật. Hãy tự xử lý thủ công.' };
  }
  const text = lower(doc.body?.innerText ?? doc.body?.textContent);
  if (HINTS.blocked.some((h) => text.includes(h))) {
    return { kind: 'fatal', reason: 'Facebook báo việc đăng bài bị hạn chế hoặc bị chặn. Hãy dừng lại và chờ.' };
  }
  if (HINTS.cannotPost.some((h) => text.includes(h))) {
    return { kind: 'skip', reason: 'Bạn không thể đăng bài trong nhóm này.' };
  }
  return null;
}

/** True when the page shows a "pending approval" notice. Compare before and after posting: admins may see one all the time. */
export function detectPendingApproval(doc: Document): boolean {
  const text = lower(doc.body?.innerText ?? doc.body?.textContent);
  return HINTS.pending.some((h) => text.includes(h));
}

export function findByText(root: ParentNode, selector: string, hints: readonly string[]): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>(selector)) {
    const label = lower(el.getAttribute('aria-label')) || lower(el.textContent);
    if (hints.some((h) => label === h || label.startsWith(h))) return el;
  }
  return null;
}

export const findComposerTrigger = (doc: Document) => findByText(doc, '[role="button"]', HINTS.composer);

export const findJoinButton = (doc: Document) => findByText(doc, '[role="button"]', HINTS.join);

export function findDialogTextbox(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('[role="dialog"] [role="textbox"][contenteditable="true"]');
}

/** Facebook can stack several dialogs, so look in every one and return the first match. */
export function findPostButton(doc: Document): HTMLElement | null {
  for (const dialog of doc.querySelectorAll('[role="dialog"]')) {
    const button = findByText(dialog, '[role="button"]', HINTS.post);
    if (button) return button;
  }
  return null;
}

/** File input of the composer dialog that takes images. Null when the composer does not show one. */
export function findImageInput(doc: Document): HTMLInputElement | null {
  for (const input of doc.querySelectorAll<HTMLInputElement>('[role="dialog"] input[type="file"]')) {
    if (/image\/|\.(jpe?g|png|webp)/i.test(input.getAttribute('accept') ?? '')) return input;
  }
  return null;
}

/** Button in the composer dialog that reveals the photo picker. */
export function findPhotoButton(doc: Document): HTMLElement | null {
  for (const dialog of doc.querySelectorAll('[role="dialog"]')) {
    const button = findByText(dialog, '[role="button"]', HINTS.photo);
    if (button) return button;
  }
  return null;
}

/** Close button of the link preview card inside the composer. Null when no card is shown. */
export function findLinkPreviewCloseButton(doc: Document): HTMLElement | null {
  for (const dialog of doc.querySelectorAll('[role="dialog"]')) {
    const button = findByText(dialog, '[role="button"]', HINTS.removePreview);
    if (button) return button;
  }
  return null;
}

/** Local image previews in the composer. Compare with the count before attaching. */
export function countComposerImages(doc: Document): number {
  return doc.querySelectorAll('[role="dialog"] img[src^="blob:"], [role="dialog"] img[src^="data:"]').length;
}

/** True while the composer still shows an upload in progress. */
export function isComposerBusy(doc: Document): boolean {
  return doc.querySelector('[role="dialog"] [role="progressbar"], [role="dialog"] [aria-busy="true"]') !== null;
}

/**
 * Types text the way a person does: each line, then Enter (a new paragraph) between lines.
 * One `insertText` call with "\n" inside lost every line break on Facebook's editor.
 * `exec` is `document.execCommand`, passed in so this stays testable.
 */
export function insertLines(exec: (command: string, value?: string) => boolean, text: string): void {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, index) => {
    if (index > 0) exec('insertParagraph');
    if (line) exec('insertText', line);
  });
}

/** Fallback: hands the text to the editor as a paste of plain text. */
export function pasteText(target: HTMLElement, text: string): void {
  const data = new DataTransfer();
  data.setData('text/plain', text);
  target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
}

/** False when the text had line breaks but the editor shows none, so the post would be one block. */
export function keptLineBreaks(textbox: HTMLElement, text: string): boolean {
  if (!hasLineBreaks(text)) return true;
  return /\n/.test((textbox.innerText ?? textbox.textContent ?? '').trim());
}

/** True when the text has a line break between visible lines (a leading or trailing one does not count). */
export const hasLineBreaks = (text: string): boolean => /\n/.test(text.replace(/\r\n?/g, '\n').trim());

/**
 * True when the editor holds the text about twice. Whitespace is ignored because Facebook
 * renders line breaks its own way. Very short texts are not checked.
 */
export function isDuplicatedText(actual: string, expected: string): boolean {
  const squash = (value: string) => value.replace(/\s+/g, '');
  const want = squash(expected);
  return want.length >= 20 && squash(actual).length >= want.length * 1.8;
}

/** Gives a file input its files the way a drop or picker would, using standard browser APIs only. */
export function setInputFiles(input: HTMLInputElement, files: readonly File[]): boolean {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
  if (input.files?.length !== files.length) return false;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/**
 * Short, text-free summary of what is still on screen after Post was clicked.
 * Only Facebook's own UI labels (dialog heading/aria-label) are included, never the post text.
 */
export function describeDialogState(doc: Document): string {
  const dialogs = [...doc.querySelectorAll('[role="dialog"]')];
  if (dialogs.length === 0) return 'không còn hộp thoại';
  const button = findPostButton(doc);
  const buttonState = !button ? 'không thấy nút Đăng' : isEnabled(button) ? 'nút Đăng đang bật' : 'nút Đăng đang khóa';
  const labels = dialogs
    .map((d) => (d.getAttribute('aria-label') || d.querySelector('[role="heading"], h1, h2')?.textContent || '').trim())
    .filter((l) => l.length > 0 && l.length <= 60);
  const heading = labels.length ? `; tiêu đề: ${[...new Set(labels)].slice(0, 2).join(' | ')}` : '';
  return `${dialogs.length} hộp thoại, ${buttonState}${heading}`;
}

/**
 * The post counts as submitted once the dialog textbox is gone or has been emptied.
 * Some groups keep the dialog open for a while after Post, so an empty box is enough.
 */
export function isComposerSubmitted(doc: Document): boolean {
  const textbox = findDialogTextbox(doc);
  return !textbox || !(textbox.textContent ?? '').trim();
}

export const isEnabled = (el: HTMLElement): boolean => el.getAttribute('aria-disabled') !== 'true' && !el.matches(':disabled');

export function waitFor<T>(probe: () => T | null | undefined | false, timeoutMs: number, intervalMs = 250): Promise<T | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const value = probe();
      if (value) return resolve(value);
      if (Date.now() - start >= timeoutMs) return resolve(null);
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

const GENERIC_TITLES = new Set(['facebook', 'log in to facebook', 'đăng nhập facebook', 'đăng nhập hoặc đăng ký facebook']);

/** Strips the unread counter and the "| Facebook" suffix; null when nothing useful is left. */
export function cleanGroupTitle(title: string): string | null {
  const name = title
    .normalize('NFC')
    .replace(/^\(\d+\+?\)\s*/, '')
    .replace(/\s*[|\-–—]\s*facebook\s*$/i, '')
    .trim();
  return name && !GENERIC_TITLES.has(name.toLowerCase()) ? name : null;
}

/** Group name shown on the page the user's own browser already loaded. Read-only. */
export function readGroupName(doc: Document): string | null {
  const fromTitle = cleanGroupTitle(doc.title);
  if (fromTitle) return fromTitle;
  const heading = doc.querySelector('h1')?.textContent?.trim();
  return heading ? heading.normalize('NFC') : null;
}

/** Parse Facebook's Vietnamese absolute timestamp in the browser's local timezone. */
function parseFacebookDate(value: string): number {
  const match = value.normalize('NFC').replace(/\s+/g, ' ').match(/(?:^|,\s*)(\d{1,2})\s+tháng\s+(\d{1,2}),\s*(\d{4})\s+lúc\s+(\d{1,2}):(\d{2})(?:\s|$)/i);
  if (!match) return NaN;
  const [, d, m, y, h, min] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min));
  return date.getFullYear() === Number(y) && date.getMonth() === Number(m) - 1 && date.getDate() === Number(d) && date.getHours() === Number(h) && date.getMinutes() === Number(min) ? date.getTime() : NaN;
}

/** Relative labels are rounded down by Facebook; exclude ambiguous day labels. */
function parseRelativeDate(value: string, now: number): number {
  const match = lower(value).replace(/\s+/g, ' ').match(/^(\d+)\s*(giây|phút|giờ|seconds?|minutes?|hours?|s|m|h)(?:\s+trước|\s+ago)?$/);
  if (!match) return NaN;
  const n = Number(match[1]);
  const unit = match[2];
  const ms = unit === 'giây' || unit === 's' || unit?.startsWith('second') ? 1000 : unit === 'phút' || unit === 'm' || unit?.startsWith('minute') ? 60_000 : 3_600_000;
  // Account for rounding so only posts certainly within 24 hours qualify.
  return (n + 1) * ms <= 86_400_000 ? now - n * ms : NaN;
}

function groupPostUrl(url: URL, groupId: string): string | null {
  if (url.protocol !== 'https:' || !['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'].includes(url.hostname)) return null;
  const match = url.pathname.match(/^\/groups\/([A-Za-z0-9._-]+)\/(?:posts|permalink)\/(\d+)\/?$/);
  if (match && match[1] === groupId) return `https://www.facebook.com/groups/${groupId}/posts/${match[2]}/`;
  const group = url.pathname.match(/^\/groups\/([A-Za-z0-9._-]+)\/?$/);
  const ids = url.searchParams.getAll('multi_permalinks');
  return group?.[1] === groupId && ids.length === 1 && /^\d+$/.test(ids[0] ?? '')
    ? `https://www.facebook.com/groups/${groupId}/posts/${ids[0]}/` : null;
}

/** Read structured feed stories without evaluating scripts or using unrelated recommendations. */
function findStructuredGroupPosts(doc: Document, groupId: string, now: number): Array<{ url: string; postedAt: number }> {
  const result = new Map<string, number>();
  for (const script of doc.querySelectorAll<HTMLScriptElement>('script[type="application/json"]')) {
    const text = script.textContent ?? '';
    if (!text.includes('"post_id"') || !text.includes('"creation_time"')) continue;
    let data: unknown;
    try { data = JSON.parse(text); } catch { continue; }
    const pending: unknown[] = [data];
    while (pending.length) {
      const value = pending.pop();
      if (!value || typeof value !== 'object') continue;
      if (Array.isArray(value)) { pending.push(...value); continue; }
      const node = value as Record<string, unknown>;
      if (node.__typename === 'Story' && typeof node.post_id === 'string' && /^\d+$/.test(node.post_id) && typeof node.creation_time === 'number' && typeof node.permalink_url === 'string' && node.to && typeof node.to === 'object') {
        const group = node.to as Record<string, unknown>;
        let url: string | null = null;
        try { url = groupPostUrl(new URL(node.permalink_url), groupId); } catch { /* invalid permalink */ }
        const postedAt = node.creation_time * 1000;
        const matchesGroup = group.__typename === 'Group' && (!/^\d+$/.test(groupId) || group.id === groupId);
        if (matchesGroup && url && url.endsWith(`/posts/${node.post_id}/`) && postedAt <= now && postedAt >= now - 86_400_000) result.set(url, postedAt);
      }
      pending.push(...Object.values(node));
    }
  }
  return [...result].map(([url, postedAt]) => ({ url, postedAt }));
}

/** Accept absolute dates on article timestamps or the post link's described tooltip. */
export function findRecentGroupPosts(doc: Document, groupId: string, now: number): Array<{ url: string; postedAt: number }> {
  const result = new Map(findStructuredGroupPosts(doc, groupId, now).map((post) => [post.url, post.postedAt]));
  for (const link of doc.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    let url: URL;
    try { url = new URL(link.href, 'https://www.facebook.com'); } catch { continue; }
    let postUrl = groupPostUrl(url, groupId);
    const ids = (link.getAttribute('aria-describedby') ?? '').trim().split(/\s+/);
    const dates = ids.map((id) => parseFacebookDate(doc.getElementById(id)?.textContent ?? '')).filter(Number.isFinite);
    if (dates.length > 1) continue;
    const labelIds = (link.getAttribute('aria-labelledby') ?? '').trim().split(/\s+/);
    const labels = [link.textContent ?? '', ...labelIds.map((id) => doc.getElementById(id)?.textContent ?? '')];
    const relative = labels.map((label) => parseRelativeDate(label, now)).filter(Number.isFinite);
    const postedAt = dates[0] ?? relative[0] ?? NaN;
    if (!postUrl && Number.isFinite(postedAt) && url.protocol === 'https:' && ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'].includes(url.hostname) && url.pathname.replace(/\/$/, '') === `/groups/${groupId}` && url.hash.startsWith('#?')) {
      // Some feeds defer the timestamp URL. A comment link in the same post can expose its ID.
      for (let parent = link.parentElement; parent && parent !== doc.body; parent = parent.parentElement) {
        const timestampLinks = [...parent.querySelectorAll<HTMLAnchorElement>('a[aria-describedby]')].filter((a) =>
          (a.getAttribute('aria-describedby') ?? '').split(/\s+/).some((id) => Number.isFinite(parseFacebookDate(doc.getElementById(id)?.textContent ?? ''))));
        if (timestampLinks.length > 1) break;
        const urls = new Set([...parent.querySelectorAll<HTMLAnchorElement>('a[href]')].map((a) => {
          try { return groupPostUrl(new URL(a.href), groupId); } catch { return null; }
        }).filter((v): v is string => v !== null));
        if (urls.size > 1) break;
        if (timestampLinks.length === 1 && urls.size === 1) { postUrl = [...urls][0]!; break; }
      }
    }
    if (!postUrl) continue;
    if (!result.has(postUrl) && postedAt <= now && postedAt >= now - 24 * 60 * 60 * 1000) result.set(postUrl, postedAt);
  }
  for (const article of doc.querySelectorAll('[role="article"], article')) {
    const time = article.querySelector('time[datetime]')?.getAttribute('datetime');
    const postedAt = time ? Date.parse(time) : NaN;
    if (!Number.isFinite(postedAt) || postedAt > now || postedAt < now - 24 * 60 * 60 * 1000) continue;
    for (const link of article.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      let url: URL;
      try { url = new URL(link.href, 'https://www.facebook.com'); } catch { continue; }
      const postUrl = groupPostUrl(url, groupId);
      if (!postUrl) continue;
      if (!result.has(postUrl)) result.set(postUrl, postedAt);
      break;
    }
  }
  return [...result].map(([url, postedAt]) => ({ url, postedAt }));
}

/** Diagnostic only: a visible editor does not establish a post identity or age. */
export function countCommentEditors(doc: Document): number {
  return [...doc.querySelectorAll<HTMLElement>('[role="textbox"][contenteditable="true"]')]
    .filter((el) => /comment|bình luận/i.test(lower(el.getAttribute('aria-label')))).length;
}

/** Count rendered comment-like text outside editors to detect a new visible occurrence. */
export function countVisibleCommentText(doc: Document, text: string): number {
  const expected = text.trim();
  if (!expected) return 0;
  return [...doc.querySelectorAll<HTMLElement>('[dir="auto"]')].filter((el) =>
    el.children.length === 0 && !el.closest('[contenteditable="true"]') && el.getClientRects().length > 0 && (el.textContent ?? '').trim() === expected,
  ).length;
}

/** Only use an unambiguous editor on the opened post page. */
export function findCommentTextbox(doc: Document): HTMLElement | null {
  const boxes = [...doc.querySelectorAll<HTMLElement>('[role="textbox"][contenteditable="true"]')]
    .filter((el) => /comment|bình luận/i.test(el.getAttribute('aria-label') ?? ''));
  return boxes.length === 1 ? boxes[0]! : null;
}

/** Scope the send button to the editor's form (or its article for older markup). */
export function findCommentButton(textbox: HTMLElement): HTMLElement | null {
  const root = textbox.closest('form') ?? textbox.closest('[role="article"], article');
  if (!root) return null;
  const buttons = [...root.querySelectorAll<HTMLElement>('[role="button"], button')]
    .filter((el) => /^(post comment|send comment|send|bình luận|đăng bình luận|gửi bình luận|gửi)$/i.test((el.getAttribute('aria-label') ?? '').trim()));
  return buttons.length === 1 ? buttons[0]! : null;
}
