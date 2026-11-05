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

export const isEnabled = (el: HTMLElement): boolean => el.getAttribute('aria-disabled') !== 'true';

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
