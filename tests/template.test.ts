import { describe, expect, it } from 'vitest';
import { LIMITS } from '../src/lib/limits';
import { FALLBACK_GROUP_NAME, hasUnknownPlaceholder, listPlaceholders, renderPost, renderTemplate } from '../src/lib/template';
import { pickVariation } from '../src/lib/run-engine';

describe('renderTemplate', () => {
  it('replaces {group} with the group name', () => {
    expect(renderTemplate('Xin chào {group}!', { group: 'Dev Hà Nội' })).toBe('Xin chào Dev Hà Nội!');
  });
  it('replaces every occurrence', () => {
    expect(renderTemplate('{group} và {group}', { group: 'A' })).toBe('A và A');
  });
  it('ignores case and spaces inside the braces', () => {
    expect(renderTemplate('{Group} {GROUP} { group } {  Group  }', { group: 'X' })).toBe('X X X X');
  });
  it('keeps unknown placeholders untouched', () => {
    expect(renderTemplate('{foo} {group} {bar_1}', { group: 'X' })).toBe('{foo} X {bar_1}');
  });
  it('uses the fallback when the group name is empty or unknown', () => {
    expect(renderTemplate('Chào {group}', { group: '' })).toBe(`Chào ${FALLBACK_GROUP_NAME}`);
    expect(renderTemplate('Chào {group}', { group: '   ' })).toBe(`Chào ${FALLBACK_GROUP_NAME}`);
    expect(renderTemplate('Chào {group}', { group: null })).toBe(`Chào ${FALLBACK_GROUP_NAME}`);
    expect(renderTemplate('Chào {group}', {})).toBe(`Chào ${FALLBACK_GROUP_NAME}`);
    expect(renderTemplate('Chào {group}', { group: '' })).not.toContain('{group}');
  });
  it('treats special replacement patterns in the name literally', () => {
    expect(renderTemplate('[{group}]', { group: '$& $1 $$ {x}' })).toBe('[$& $1 $$ {x}]');
  });
  it('does not replace again inside the inserted name', () => {
    expect(renderTemplate('{group}', { group: 'Tên {group}' })).toBe('Tên {group}');
  });
  it('leaves text without placeholders unchanged', () => {
    expect(renderTemplate('Không có gì {', { group: 'X' })).toBe('Không có gì {');
  });
});

describe('listPlaceholders / hasUnknownPlaceholder', () => {
  it('lists unique lowercase names', () => {
    expect(listPlaceholders('{Group} {group} { foo } {foo}')).toEqual(['group', 'foo']);
    expect(listPlaceholders('không có')).toEqual([]);
  });
  it('flags only names other than group', () => {
    expect(hasUnknownPlaceholder('Chào {group}')).toBe(false);
    expect(hasUnknownPlaceholder('Chào {date}')).toBe(true);
    expect(hasUnknownPlaceholder('Chào')).toBe(false);
  });
});

describe('renderPost', () => {
  it('returns the rendered text', () => {
    expect(renderPost('Chào {group}', 'A')).toEqual({ ok: true, text: 'Chào A' });
  });
  it('accepts text exactly at the limit', () => {
    const text = 'x'.repeat(LIMITS.maxPostLength - '{group}'.length) + '{group}';
    expect(renderPost(text, 'abcdefg')).toMatchObject({ ok: true });
  });
  it('rejects a post that becomes too long after replacing', () => {
    const text = 'x'.repeat(LIMITS.maxPostLength - '{group}'.length) + '{group}';
    const result = renderPost(text, 'a very long group name');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/quá dài/);
  });
  it('rotates versions across groups, each rendered with its own group name', () => {
    const versions = ['Chào {group} (A)', 'Hi {group} (B)'];
    const names = ['G1', 'G2', 'G3'];
    const out = names.map((name, i) => {
      const r = renderPost(pickVariation(versions, i), name);
      return r.ok ? r.text : '';
    });
    expect(out).toEqual(['Chào G1 (A)', 'Hi G2 (B)', 'Chào G3 (A)']);
  });
});
