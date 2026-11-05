/**
 * Facebook DOM helpers. Facebook changes its markup often and has no public API
 * for group posting, so every selector lives here, in one place, with text hints
 * in English and Vietnamese. When Facebook changes, update this file and its tests.
 */

const lower = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase();

export const HINTS = {
  composer: ['write something', 'create a public post', 'bạn viết gì đi', 'tạo bài viết công khai'],
  post: ['post', 'đăng'],
  join: ['join group', 'tham gia nhóm'],
  blocked: [
    "you're temporarily blocked",
    'you’re temporarily blocked',
    'we limit how often you can post',
    'bạn tạm thời bị chặn',
    'chúng tôi hạn chế tần suất',
  ],
  cannotPost: [
    'only admins can post',
    'chỉ quản trị viên mới có thể đăng',
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

export function findPostButton(doc: Document): HTMLElement | null {
  const dialog = doc.querySelector('[role="dialog"]');
  return dialog ? findByText(dialog, '[role="button"]', HINTS.post) : null;
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
