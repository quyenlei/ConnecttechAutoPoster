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
    // Comment limits. Wording unverified on live Facebook.
    "you can't comment right now",
    'you can’t comment right now',
    "you're temporarily restricted from commenting",
    'you’re temporarily restricted from commenting',
    'bạn hiện không thể bình luận',
    'bạn tạm thời không thể bình luận',
    'bạn đang bị hạn chế bình luận',
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

const DAY_MS = 86_400_000;
const FB_HOSTS = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'];
const EN_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function validDate(y: number, m: number, d: number, h: number, min: number): number {
  const date = new Date(y, m - 1, d, h, min);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d && date.getHours() === h && date.getMinutes() === min ? date.getTime() : NaN;
}

/**
 * Facebook's absolute timestamp (tooltip of the post time), in the browser's local timezone.
 * Vietnamese "5 Tháng 11, 2026 lúc 14:15" (year optional) or English "November 5, 2026 at 2:15 PM".
 */
export function parseFacebookDate(value: string, now = Date.now()): number {
  const text = value.normalize('NFC').replace(/\s+/g, ' ');
  const vi = text.match(/(?:^|[\s,])(\d{1,2})\s+tháng\s+(\d{1,2})(?:,\s*(\d{4}))?\s+lúc\s+(\d{1,2}):(\d{2})(?:\s|$)/i);
  if (vi) {
    const [, d, m, y, h, min] = vi;
    return validDate(y ? Number(y) : new Date(now).getFullYear(), Number(m), Number(d), Number(h), Number(min));
  }
  const en = text.match(/([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  const month = en ? EN_MONTHS.indexOf((en[1] ?? '').toLowerCase()) : -1;
  if (en && month >= 0) {
    const [, , d, y, h, min, ampm] = en;
    let hour = Number(h);
    if (ampm) hour = (hour % 12) + (ampm.toUpperCase() === 'PM' ? 12 : 0);
    return validDate(y ? Number(y) : new Date(now).getFullYear(), month + 1, Number(d), hour, Number(min));
  }
  return NaN;
}

/** How old a post is. Facebook rounds relative labels down, so the age lies between the two values. */
export interface PostAge {
  minAgeMs: number;
  maxAgeMs: number;
  /** The time label it was read from (short, never post text), for the log. */
  label?: string;
  /**
   * Read from an absolute date. Facebook can render those in another time zone in the first page load
   * (seen live: US Pacific, 15 hours off from Vietnam), so a relative label is preferred when both exist.
   */
  absolute?: boolean;
}

const AGE_UNITS: Array<[RegExp, number]> = [
  [/^(giây|s|secs?|seconds?)$/, 1000],
  [/^(phút|m|mins?|minutes?)$/, 60_000],
  [/^(giờ|h|hrs?|hours?)$/, 3_600_000],
  [/^(ngày|d|days?)$/, DAY_MS],
  [/^(tuần|w|wks?|weeks?)$/, 7 * DAY_MS],
  [/^(năm|y|yrs?|years?)$/, 365 * DAY_MS],
];

/** Reads a post time label: "47 phút", "3 giờ trước", "2 d", "Vừa xong", "Hôm qua lúc 10:00" or an absolute date. */
export function parseAgeLabel(label: string, now: number): PostAge | null {
  const text = lower(label).replace(/\s+/g, ' ').replace(/^(khoảng|about)\s+/, '');
  if (!text || text.length > 60) return null;
  if (/^(vừa xong|just now)$/.test(text)) return { minAgeMs: 0, maxAgeMs: 60_000 };
  const relative = text.match(/^(\d{1,3})\s*([a-zà-ỹ]+)(?: trước| ago)?$/);
  if (relative) {
    const n = Number(relative[1]);
    const unit = AGE_UNITS.find(([pattern]) => pattern.test(relative[2] ?? ''))?.[1];
    return unit ? { minAgeMs: n * unit, maxAgeMs: (n + 1) * unit } : null;
  }
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const yesterday = text.match(/^(hôm qua|yesterday)(?: (?:lúc|at) (\d{1,2}):(\d{2})\s*(am|pm)?)?$/);
  if (yesterday) {
    if (!yesterday[2]) return { minAgeMs: now - startOfToday, maxAgeMs: now - startOfToday + DAY_MS };
    let hour = Number(yesterday[2]);
    if (yesterday[4]) hour = (hour % 12) + (yesterday[4] === 'pm' ? 12 : 0);
    const d = new Date(startOfToday - DAY_MS);
    d.setHours(hour, Number(yesterday[3]));
    return { minAgeMs: now - d.getTime(), maxAgeMs: now - d.getTime() };
  }
  const at = parseFacebookDate(label, now);
  return Number.isFinite(at) && at <= now ? { minAgeMs: now - at, maxAgeMs: now - at, absolute: true } : null;
}

function groupPostUrl(url: URL, groupId: string): string | null {
  if (url.protocol !== 'https:' || !FB_HOSTS.includes(url.hostname)) return null;
  const match = url.pathname.match(/^\/groups\/([A-Za-z0-9._-]+)\/(?:posts|permalink)\/(\d+)\/?$/);
  if (match && match[1] === groupId) return `https://www.facebook.com/groups/${groupId}/posts/${match[2]}/`;
  const group = url.pathname.match(/^\/groups\/([A-Za-z0-9._-]+)\/?$/);
  const ids = url.searchParams.getAll('multi_permalinks');
  return group?.[1] === groupId && ids.length === 1 && /^\d+$/.test(ids[0] ?? '')
    ? `https://www.facebook.com/groups/${groupId}/posts/${ids[0]}/` : null;
}

/**
 * Post times from the structured data Facebook embeds in the first page load (no script is run).
 * Posts loaded later by scrolling are usually not in it, so this only helps for the first few.
 */
export function readStructuredPostTimes(doc: Document, groupId: string): Map<string, number> {
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
        const matchesGroup = group.__typename === 'Group' && (!/^\d+$/.test(groupId) || group.id === groupId);
        if (matchesGroup && url && url.endsWith(`/posts/${node.post_id}/`)) result.set(url, node.creation_time * 1000);
      }
      pending.push(...Object.values(node));
    }
  }
  return result;
}

/** Feed items: the direct children of the group feed, in page order (newest first when sorted by new posts). */
export function findFeedItems(doc: Document): HTMLElement[] {
  const feed = doc.querySelector('[role="feed"]');
  return feed ? [...feed.children].filter((el): el is HTMLElement => el instanceof HTMLElement) : [];
}

/** Items far from the viewport are empty placeholders until Facebook renders them. */
export function isFeedItemRendered(item: HTMLElement): boolean {
  return item.querySelector('[dir="auto"], [contenteditable="true"], [role="button"], a[href]') !== null;
}

const COMMENT_LABEL = /^(bình luận|phản hồi|comment|reply)/i;

/**
 * Comments are articles inside the post: either labelled "Bình luận dưới tên …" or nested in the post's own
 * article. The post itself may be the item or an unlabelled article directly inside it.
 */
function isCommentNode(node: Element, item: Element): boolean {
  if (node === item || node.getAttribute('role') !== 'article') return false;
  if (COMMENT_LABEL.test((node.getAttribute('aria-label') ?? '').normalize('NFC').trim())) return true;
  const outer = node.parentElement?.closest('[role="article"]') ?? null;
  return outer !== null && (outer === item || item.contains(outer));
}

/** True when `el` belongs to a comment of the post rather than to the post itself. */
function inComment(el: Element, item: Element): boolean {
  for (let node: Element | null = el; node && node !== item; node = node.parentElement) {
    if (isCommentNode(node, item)) return true;
  }
  return false;
}

/** Elements of the post itself: outside its comments and outside comment editors. */
function own<T extends HTMLElement>(item: HTMLElement, selector: string): T[] {
  return [...item.querySelectorAll<T>(selector)].filter((el) => !inComment(el, item) && !el.closest('[contenteditable="true"]'));
}

const before = (a: Node, b: Node | null): boolean => !b || (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

/** The one comment editor of the post (reply editors inside comments do not count). */
export function findItemEditor(item: HTMLElement): HTMLElement | null {
  const editors = [...item.querySelectorAll<HTMLElement>('[contenteditable="true"]')].filter((el) => !inComment(el, item));
  return editors.length === 1 ? editors[0]! : null;
}

const COMMENT_ACTION = /^(bình luận|comment|viết bình luận|leave a comment|bình luận về bài viết của .+|comment on .+)$/i;

/** The action-bar "Bình luận" button that opens the comment editor of a post that shows none yet. */
export function findItemCommentAction(item: HTMLElement): HTMLElement | null {
  return own<HTMLElement>(item, '[role="button"], button')
    .find((el) => !el.closest('form') && COMMENT_ACTION.test((el.getAttribute('aria-label') || el.textContent || '').trim().normalize('NFC'))) ?? null;
}

const MY_NAME = /(?:bình luận dưới tên|trả lời dưới tên|comment as|reply as|answer as)\s+(.+?)\s*$/i;

/** The logged-in user's name, read from a comment editor's label ("Bình luận dưới tên …"). Null when no editor shows it. */
export function findMyName(doc: Document): string | null {
  for (const box of doc.querySelectorAll<HTMLElement>('[contenteditable="true"]')) {
    const labels = [box.getAttribute('aria-label'), box.getAttribute('aria-placeholder'), box.textContent ? null : box.parentElement?.textContent];
    for (const label of labels) {
      const name = MY_NAME.exec((label ?? '').normalize('NFC').trim())?.[1];
      if (name) return name;
    }
  }
  return null;
}

const COMMENT_BY = /^(?:bình luận dưới tên|bình luận của|phản hồi dưới tên|phản hồi của|comment by|reply by)\s+(.+)$/i;
const squash = (s: string) => lower(s).replace(/\s+/g, ' ');

/**
 * True when the post already shows a comment by the logged-in user, or a comment with one of `ownTexts`.
 * Only rendered comments can be seen; local history covers the rest.
 */
export function hasMyComment(item: HTMLElement, myName: string | null, ownTexts: readonly string[]): boolean {
  const name = myName ? squash(myName) : '';
  const comments = [...item.querySelectorAll<HTMLElement>('[role="article"]')].filter((el) => isCommentNode(el, item));
  if (name) {
    for (const comment of comments) {
      const by = COMMENT_BY.exec((comment.getAttribute('aria-label') ?? '').normalize('NFC').trim())?.[1];
      if (by && squash(by).startsWith(name)) return true;
      if ([...comment.querySelectorAll('a')].some((a) => squash(a.textContent ?? '') === name)) return true;
    }
  }
  const texts = ownTexts.map(squash).filter(Boolean);
  if (texts.length === 0) return false;
  return [...item.querySelectorAll<HTMLElement>('[dir="auto"]')].some((el) => !el.closest('[contenteditable="true"]') && texts.includes(squash(el.textContent ?? '')));
}

function readPostUrl(item: HTMLElement, groupId: string): string | null {
  const urls = new Set<string>();
  for (const link of own<HTMLAnchorElement>(item, 'a[href]')) {
    try {
      const url = groupPostUrl(new URL(link.href, 'https://www.facebook.com'), groupId);
      if (url) urls.add(url);
    } catch { /* not a URL */ }
  }
  return urls.size === 1 ? [...urls][0]! : null;
}

/** Time of the post: structured data, a `time` element, a tooltip date, or the short label in the post header. */
export function readPostAge(item: HTMLElement, now: number, structured?: ReadonlyMap<string, number>, url?: string | null): PostAge | null {
  const labelled = (age: PostAge | null, label: string): PostAge | null => (age ? { ...age, label: label.trim().slice(0, 60) } : null);
  const known = url ? structured?.get(url) : undefined;
  if (known !== undefined && known <= now) return { minAgeMs: now - known, maxAgeMs: now - known, label: 'dữ liệu bài' };
  const stop = findItemEditor(item) ?? findItemCommentAction(item);
  const header = (el: Element) => before(el, stop);
  for (const time of own<HTMLElement>(item, 'time[datetime]').filter(header)) {
    const at = Date.parse(time.getAttribute('datetime') ?? '');
    if (Number.isFinite(at) && at <= now) return { minAgeMs: now - at, maxAgeMs: now - at, label: time.getAttribute('datetime') ?? '' };
  }
  // Every time label of the header, in page order: tooltip/label references first, then visible text.
  const doc = item.ownerDocument;
  const labels: string[] = [];
  for (const el of own<HTMLElement>(item, '[aria-describedby], [aria-labelledby]').filter(header)) {
    const ids = `${el.getAttribute('aria-labelledby') ?? ''} ${el.getAttribute('aria-describedby') ?? ''}`.trim().split(/\s+/);
    for (const id of ids) if (id) labels.push(doc.getElementById(id)?.textContent ?? '');
  }
  for (const el of own<HTMLElement>(item, 'a, span, abbr, [role="link"]').filter(header)) {
    if (el.children.length > 0 && el.tagName !== 'A') continue;
    labels.push(el.getAttribute('aria-label') ?? '', el.textContent ?? '');
  }
  const ages = labels.map((text) => labelled(parseAgeLabel(text, now), text)).filter((age): age is PostAge => age !== null);
  return ages.find((age) => !age.absolute) ?? ages[0] ?? null;
}

const AUTHOR_IN_LABEL = /(?:bình luận về bài viết của|comment on)\s+(.+?)(?:'s post)?(?:,\s*\d+\s+.+)?$/i;
const SEE_MORE = /\s*(?:…|\.\.\.)?\s*(?:xem thêm|see more)\s*$/i;

function readAuthor(item: HTMLElement): string {
  for (const el of own<HTMLElement>(item, '[role="button"], button')) {
    const author = AUTHOR_IN_LABEL.exec((el.getAttribute('aria-label') ?? '').trim())?.[1];
    if (author) return author;
  }
  for (const el of own<HTMLElement>(item, '[data-ad-rendering-role="profile_name"], h2, h3, h4, strong')) {
    const text = (el.textContent ?? '').trim();
    if (text) return text;
  }
  return '';
}

/** Post body marker Facebook puts around the message (seen live 2026-11-10). */
const STORY_MESSAGE = '[data-ad-rendering-role="story_message"], [data-ad-comet-preview="message"], [data-ad-preview="message"]';
/**
 * Facebook pads every post with hidden filler text (a blockquote of repeated "Facebook", scrambled single letters).
 * It is the same for every post, so it must never become the post body.
 */
const isFiller = (text: string): boolean => /^(?:facebook\s*)+$/i.test(text) || /^(?:\S[\s\u034f\u200b-\u200d]*){1,2}$/.test(text);

/** The text of the post, which does not change when comments load or "Xem thêm" is pressed. */
function readBody(item: HTMLElement, author: string, now: number): string {
  const clean = (text: string) => text.trim().replace(SEE_MORE, '').replace(/\s+/g, ' ').slice(0, 160);
  const message = own<HTMLElement>(item, STORY_MESSAGE)[0];
  if (message) {
    const text = clean(message.textContent ?? '');
    if (text) return text;
  }
  for (const el of own<HTMLElement>(item, '[dir="auto"]')) {
    if (el.closest('h2, h3, h4, strong, form, a, blockquote, [aria-hidden="true"], [role="button"], [role="link"]')) continue;
    const text = clean(el.textContent ?? '');
    if (text.length < 2 || text === author || isFiller(text) || parseAgeLabel(text, now)) continue;
    return text;
  }
  return '';
}

/** Short non-reversible tag used to remember a feed post that has no ID. Only the tag is stored, never the text. */
export function postFingerprint(author: string, body: string): string {
  const input = `${author.trim().replace(/\s+/g, ' ').slice(0, 80)}|${body.trim().replace(/\s+/g, ' ').slice(0, 160)}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export interface FeedPost {
  element: HTMLElement;
  author: string;
  body: string;
  /** Null when neither author nor text could be read. */
  fingerprint: string | null;
  url: string | null;
  age: PostAge | null;
  /** Already shows a comment by the logged-in user or with a campaign text. */
  mine: boolean;
  editor: HTMLElement | null;
  commentAction: HTMLElement | null;
}

export interface FeedReadContext {
  groupId: string;
  now: number;
  myName: string | null;
  ownTexts: readonly string[];
  structured?: ReadonlyMap<string, number>;
}

/** Everything the extension needs to know about one rendered feed item. Read-only. */
export function readFeedPost(item: HTMLElement, ctx: FeedReadContext): FeedPost {
  const author = readAuthor(item);
  const body = readBody(item, author, ctx.now);
  const url = readPostUrl(item, ctx.groupId);
  return {
    element: item,
    author,
    body,
    fingerprint: author || body ? postFingerprint(author, body) : null,
    url,
    age: readPostAge(item, ctx.now, ctx.structured, url),
    mine: hasMyComment(item, ctx.myName, ctx.ownTexts),
    editor: findItemEditor(item),
    commentAction: findItemCommentAction(item),
  };
}

const PROFILE_PATH = /\/user\/|profile\.php|^\/[A-Za-z0-9.]+\/?$/;

/**
 * Elements in the post header that may be the post time. Facebook fills in the time and the post link
 * only when the pointer is over them, so these get a hover (see `hoverOver`) when nothing else gives the time.
 * Profile links are left out so no profile card is opened.
 */
export function findTimestampTargets(item: HTMLElement, max = 4): HTMLElement[] {
  const stop = findItemEditor(item) ?? findItemCommentAction(item);
  return own<HTMLElement>(item, 'a, [role="link"], [aria-describedby]')
    .filter((el) => before(el, stop))
    .filter((el) => {
      const href = el.getAttribute('href');
      if (!href || href.startsWith('#')) return true;
      try {
        const path = new URL(href, 'https://www.facebook.com').pathname;
        return !PROFILE_PATH.test(path);
      } catch { return false; }
    })
    .slice(0, max);
}

/** The events a browser sends when the pointer moves onto an element. One element, no movement path. */
export function hoverOver(el: HTMLElement): void {
  const init = { bubbles: true, cancelable: true, composed: true, view: el.ownerDocument.defaultView };
  el.dispatchEvent(new PointerEvent('pointerover', init));
  el.dispatchEvent(new PointerEvent('pointerenter', { ...init, bubbles: false }));
  el.dispatchEvent(new MouseEvent('mouseover', init));
  el.dispatchEvent(new MouseEvent('mouseenter', { ...init, bubbles: false }));
}

/** The matching events when the pointer leaves the element again. */
export function hoverOut(el: HTMLElement): void {
  const init = { bubbles: true, cancelable: true, composed: true, view: el.ownerDocument.defaultView };
  el.dispatchEvent(new PointerEvent('pointerout', init));
  el.dispatchEvent(new PointerEvent('pointerleave', { ...init, bubbles: false }));
  el.dispatchEvent(new MouseEvent('mouseout', init));
  el.dispatchEvent(new MouseEvent('mouseleave', { ...init, bubbles: false }));
}

/** Count rendered comment-like text outside editors to detect a new visible occurrence. */
export function countVisibleCommentText(doc: ParentNode, text: string): number {
  const expected = text.trim();
  if (!expected) return 0;
  return [...doc.querySelectorAll<HTMLElement>('[dir="auto"]')].filter((el) =>
    el.children.length === 0 && !el.closest('[contenteditable="true"]') && el.getClientRects().length > 0 && (el.textContent ?? '').trim() === expected,
  ).length;
}

const SEND_LABEL = /^(post comment|send comment|send|bình luận|đăng bình luận|gửi bình luận|gửi)$/i;

/**
 * Scope the send button to the editor's form (or its article for older markup). Feed items have an action
 * bar with its own "Bình luận" button, so the search starts at the editor and widens one ancestor at a time;
 * the first level with a match wins and, among several, the one after the editor in page order.
 */
export function findCommentButton(textbox: HTMLElement): HTMLElement | null {
  const limit = textbox.closest('form') ?? textbox.closest('[role="article"], article');
  if (!limit) return null;
  for (let node = textbox.parentElement; node; node = node.parentElement) {
    const buttons = [...node.querySelectorAll<HTMLElement>('[role="button"], button')]
      .filter((el) => SEND_LABEL.test((el.getAttribute('aria-label') ?? '').trim()) && !textbox.contains(el));
    const after = buttons.filter((el) => textbox.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (after.length > 0) return after[0]!;
    if (buttons.length === 1) return buttons[0]!;
    if (node === limit) break;
  }
  return null;
}

/** Diagnostic only: the aria-labels of the buttons near the editor, to learn what Facebook renders. */
export function describeCommentButtons(textbox: HTMLElement): string {
  const root = textbox.closest('form') ?? textbox.closest('[role="article"], article') ?? textbox.parentElement;
  const labels = [...(root?.querySelectorAll<HTMLElement>('[role="button"], button') ?? [])]
    .map((el) => `${(el.getAttribute('aria-label') ?? '').trim() || '(không nhãn)'}${isEnabled(el) ? '' : ' [tắt]'}`);
  return `${textbox.closest('form') ? 'có form' : 'không form'}; nút: ${labels.slice(0, 12).join(' | ') || 'không có'}`;
}

/** The comment editor of the newest open dialog (Facebook may open the post in a dialog instead of inline). */
export function findDialogCommentEditor(doc: Document): HTMLElement | null {
  const dialogs = [...doc.querySelectorAll<HTMLElement>('[role="dialog"]')];
  const dialog = dialogs[dialogs.length - 1];
  if (!dialog) return null;
  const editors = [...dialog.querySelectorAll<HTMLElement>('[contenteditable="true"]')].filter((el) => /comment|bình luận/i.test(el.getAttribute('aria-label') ?? ''));
  return editors.length === 1 ? editors[0]! : null;
}

/** Presses Enter in an editor the way a keyboard does (keydown, keypress, keyup). Feed comment forms submit on it. */
export function pressEnter(target: HTMLElement): void {
  const init: KeyboardEventInit = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
  for (const type of ['keydown', 'keypress', 'keyup']) target.dispatchEvent(new KeyboardEvent(type, init));
}

const JOINED_HEADING = /^(tất cả các nhóm bạn đã tham gia|all groups you['’]?ve joined|all the groups you['’]?ve joined)/i;
const VIEW_GROUP = /^(xem nhóm|view group|truy cập nhóm|visit group)$/i;
/** Paths under /groups/ that are Facebook pages, not groups. */
const NOT_A_GROUP = new Set(['joins', 'feed', 'discover', 'create', 'notifications', 'search', 'your_groups', 'pending', 'membership']);

/**
 * The "Tất cả các nhóm bạn đã tham gia (N)" section of facebook.com/groups/joins/: the largest block around
 * that heading which holds no other heading. This leaves out "Yêu cầu tham gia nhóm đang chờ" (requests not yet
 * accepted) and the navigation. Structure measured live on 2026-11-10.
 */
export function findJoinedGroupsSection(doc: Document): HTMLElement | null {
  const headings = [...doc.querySelectorAll<HTMLElement>('h1, h2, h3, [role="heading"]')];
  const heading = headings.find((h) => JOINED_HEADING.test((h.textContent ?? '').trim().normalize('NFC')));
  if (!heading) return null;
  let section: HTMLElement = heading;
  for (let node = heading.parentElement; node && node !== doc.body; node = node.parentElement) {
    if (node.querySelectorAll('h1, h2, h3, [role="heading"]').length > 1) break;
    section = node;
  }
  return section;
}

/** The count Facebook shows in the heading, "(144)". Null when it shows none. */
export function joinedGroupsCount(doc: Document): number | null {
  const heading = [...doc.querySelectorAll<HTMLElement>('h1, h2, h3, [role="heading"]')].find((h) => JOINED_HEADING.test((h.textContent ?? '').trim().normalize('NFC')));
  const n = heading?.textContent?.match(/\((\d+)\)\s*$/)?.[1];
  return n ? Number(n) : null;
}

/** Groups linked in the section, once each, in page order, with the first readable name. Read-only. */
export function readJoinedGroups(section: ParentNode): Array<{ id: string; name: string | null }> {
  const found = new Map<string, { id: string; name: string | null }>();
  for (const link of section.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    let url: URL;
    try { url = new URL(link.getAttribute('href') ?? '', 'https://www.facebook.com'); } catch { continue; }
    if (url.protocol !== 'https:' || !FB_HOSTS.includes(url.hostname)) continue;
    const id = url.pathname.match(/^\/groups\/([A-Za-z0-9._-]+)\/?$/)?.[1];
    if (!id || NOT_A_GROUP.has(id.toLowerCase())) continue;
    const text = (link.textContent ?? '').trim().replace(/\s+/g, ' ');
    const name = text && !VIEW_GROUP.test(text) ? text.normalize('NFC').slice(0, 120) : null;
    const entry = found.get(id);
    if (!entry) found.set(id, { id, name });
    else if (!entry.name && name) entry.name = name;
  }
  return [...found.values()];
}

/** Presses Escape, used to close a post dialog that Facebook opened for commenting. */
export function pressEscape(target: HTMLElement): void {
  const init: KeyboardEventInit = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
  for (const type of ['keydown', 'keyup']) target.dispatchEvent(new KeyboardEvent(type, init));
}
