import { LIMITS } from './limits';

/** Used when the group name is empty or not read yet, so a bare "{group}" never reaches a post. */
export const FALLBACK_GROUP_NAME = 'bạn';

const KNOWN = 'group';
const PLACEHOLDER = /\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g;

export interface TemplateVars {
  group?: string | null;
}

/**
 * Replaces {group} (any case, spaces allowed inside the braces) in one pass.
 * Unknown placeholders stay as typed. The inserted name is never scanned again.
 */
export function renderTemplate(text: string, vars: TemplateVars): string {
  const name = vars.group?.trim() || FALLBACK_GROUP_NAME;
  return text.replace(PLACEHOLDER, (match, key: string) => (key.toLowerCase() === KNOWN ? name : match));
}

/** Unique placeholder names found in the text, lowercase, in order of first use. */
export function listPlaceholders(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    const key = (match[1] ?? '').toLowerCase();
    if (!names.includes(key)) names.push(key);
  }
  return names;
}

export const hasUnknownPlaceholder = (text: string): boolean => listPlaceholders(text).some((name) => name !== KNOWN);

export type RenderResult = { ok: true; text: string } | { ok: false; reason: string };

/** Renders a post and applies the same length limit as campaign validation. */
export function renderPost(text: string, groupName: string | null | undefined): RenderResult {
  const rendered = renderTemplate(text, { group: groupName });
  if (rendered.length > LIMITS.maxPostLength) return { ok: false, reason: 'Bài đăng quá dài sau khi chèn tên nhóm.' };
  return { ok: true, text: rendered };
}
