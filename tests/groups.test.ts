import { describe, expect, it } from 'vitest';
import { addToSelection, filterGroups, parseGroupList, parseGroupSlug, newestPostsGroupUrl, recentActivityGroupUrl, removeFromSelection, withReadName } from '../src/lib/groups';

describe('parseGroupSlug', () => {
  it('builds the recent activity feed URL for comment discovery', () => {
    expect(newestPostsGroupUrl('abc')).toBe('https://www.facebook.com/groups/abc/?sorting_setting=CHRONOLOGICAL');
  expect(recentActivityGroupUrl('2215021986104638')).toBe('https://www.facebook.com/groups/2215021986104638/?sorting_setting=RECENT_ACTIVITY');
  });
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

describe('read group names', () => {
  const list = [
    { id: '123', name: '123', url: 'u1' },
    { id: 'abc', name: 'My own name', url: 'u2' },
  ];
  it('fills a placeholder name', () => {
    expect(withReadName(list, '123', 'Hội A')[0]?.name).toBe('Hội A');
  });
  it('keeps a name the user typed', () => {
    expect(withReadName(list, 'abc', 'Hội B')[1]?.name).toBe('My own name');
  });
});

describe('group selection', () => {
  const gs = [
    { id: '1', name: 'Hội Đà Nẵng', url: 'u1' },
    { id: '2', name: 'Hội Hà Nội', url: 'u2' },
    { id: '3', name: 'Sale đồ cũ', url: 'u3' },
  ];
  it('filters by name, ignoring case and Unicode form', () => {
    expect(filterGroups(gs, 'hội')).toHaveLength(2);
    expect(filterGroups(gs, 'Đà Nẵng'.normalize('NFD'))).toHaveLength(1);
    expect(filterGroups(gs, '  ')).toHaveLength(3);
    expect(filterGroups(gs, 'zzz')).toHaveLength(0);
  });
  it('adds without duplicates and respects the cap', () => {
    expect(addToSelection(['1'], ['1', '2', '3'], 10)).toEqual(['1', '2', '3']);
    expect(addToSelection(['1'], ['2', '3'], 2)).toEqual(['1', '2']);
  });
  it('removes only the given ids', () => {
    expect(removeFromSelection(['1', '2', '3'], ['2'])).toEqual(['1', '3']);
  });
});
