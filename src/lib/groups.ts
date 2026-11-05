import type { Group } from './types';

const HOSTS = new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com']);

/** Returns the group slug/id from a Facebook group URL, or null if it is not one. */
export function parseGroupSlug(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname.toLowerCase())) return null;
  const match = url.pathname.match(/^\/groups\/([A-Za-z0-9._-]+)\/?/);
  return match?.[1] ?? null;
}

export function canonicalGroupUrl(slug: string): string {
  return `https://www.facebook.com/groups/${slug}/`;
}

export interface ParsedGroups {
  groups: Group[];
  rejected: string[];
}

/**
 * One group per line: `URL` or `URL | Name` (also accepts a comma or tab).
 * Duplicates (by slug) and non-group URLs are dropped.
 */
export function parseGroupList(text: string, existing: Group[] = []): ParsedGroups {
  const seen = new Set(existing.map((g) => g.id));
  const groups: Group[] = [];
  const rejected: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [urlPart = '', ...rest] = line.split(/\s*[|\t,]\s*/);
    const slug = parseGroupSlug(urlPart);
    if (!slug) {
      rejected.push(line);
      continue;
    }
    if (seen.has(slug)) continue;
    seen.add(slug);
    groups.push({ id: slug, name: rest.join(' ').trim() || slug, url: canonicalGroupUrl(slug) });
  }
  return { groups, rejected };
}
