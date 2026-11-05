import { describe, expect, it } from 'vitest';
import { parseGroupList, parseGroupSlug } from '../src/lib/groups';

describe('parseGroupSlug', () => {
  it('accepts group urls', () => {
    expect(parseGroupSlug('https://www.facebook.com/groups/123456/')).toBe('123456');
    expect(parseGroupSlug('https://facebook.com/groups/my.group-name/posts/1')).toBe('my.group-name');
    expect(parseGroupSlug('https://m.facebook.com/groups/abc')).toBe('abc');
  });
  it('rejects other hosts, schemes and paths', () => {
    expect(parseGroupSlug('http://www.facebook.com/groups/1')).toBeNull();
    expect(parseGroupSlug('https://facebook.com.evil.com/groups/1')).toBeNull();
    expect(parseGroupSlug('https://www.facebook.com/pages/1')).toBeNull();
    expect(parseGroupSlug('javascript:alert(1)')).toBeNull();
    expect(parseGroupSlug('not a url')).toBeNull();
  });
});

describe('parseGroupList', () => {
  it('parses names, drops duplicates and reports rejects', () => {
    const text = [
      'https://www.facebook.com/groups/aaa | Group A',
      'https://www.facebook.com/groups/aaa/',
      'https://www.facebook.com/groups/bbb',
      'https://example.com/groups/ccc',
      '',
    ].join('\n');
    const { groups, rejected } = parseGroupList(text);
    expect(groups.map((g) => [g.id, g.name])).toEqual([['aaa', 'Group A'], ['bbb', 'bbb']]);
    expect(groups[0]?.url).toBe('https://www.facebook.com/groups/aaa/');
    expect(rejected).toEqual(['https://example.com/groups/ccc']);
  });
  it('skips groups that already exist', () => {
    const existing = [{ id: 'aaa', name: 'A', url: '' }];
    expect(parseGroupList('https://www.facebook.com/groups/aaa', existing).groups).toEqual([]);
  });
});
