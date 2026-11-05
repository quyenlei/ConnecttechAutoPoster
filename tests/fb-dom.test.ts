// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { detectPageProblem, findComposerTrigger, findDialogTextbox, findJoinButton, findPostButton, isEnabled, waitFor } from '../src/lib/fb-dom';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('fb-dom', () => {
  it('finds the composer trigger in English and Vietnamese', () => {
    document.body.innerHTML = '<div role="button">Write something...</div>';
    expect(findComposerTrigger(document)).not.toBeNull();
    document.body.innerHTML = '<div role="button">Bạn viết gì đi...</div>';
    expect(findComposerTrigger(document)).not.toBeNull();
    document.body.innerHTML = '<div role="button">Like</div>';
    expect(findComposerTrigger(document)).toBeNull();
  });
  it('matches Vietnamese hints regardless of Unicode form', () => {
    const nfd = 'Viết gì đó...'.normalize('NFD');
    document.body.innerHTML = `<div role="button">${nfd}</div>`;
    expect(findComposerTrigger(document)).not.toBeNull();
    document.body.innerHTML = '<div role="button">Tham gia nhóm</div>';
    expect(findJoinButton(document)).not.toBeNull();
    document.body.innerHTML = '<div role="dialog"><div role="button" aria-label="Đăng">Đăng</div></div>';
    expect(findPostButton(document)).not.toBeNull();
  });
  it('detects Vietnamese blocked and no-permission pages', () => {
    document.body.textContent = 'Bạn tạm thời bị chặn';
    expect(detectPageProblem(document, '/groups/1')?.kind).toBe('fatal');
    document.body.textContent = 'Bạn không thể đăng trong nhóm này';
    expect(detectPageProblem(document, '/groups/1')?.kind).toBe('skip');
  });
  it('finds the post button in any stacked dialog', () => {
    document.body.innerHTML =
      '<div role="dialog"><div role="button" aria-label="Đóng">Đóng</div></div>' +
      '<div role="dialog"><div role="button" aria-label="Đăng">Đăng</div></div>';
    expect(findPostButton(document)?.getAttribute('aria-label')).toBe('Đăng');
  });
  it('detects join button', () => {
    document.body.innerHTML = '<div role="button">Join group</div>';
    expect(findJoinButton(document)).not.toBeNull();
  });
  it('finds textbox and post button only inside the dialog', () => {
    document.body.innerHTML =
      '<div role="button" aria-label="Post">outside</div>' +
      '<div role="dialog"><div role="textbox" contenteditable="true"></div><div role="button" aria-label="Post" aria-disabled="true"></div></div>';
    expect(findDialogTextbox(document)).not.toBeNull();
    const btn = findPostButton(document)!;
    expect(btn.closest('[role="dialog"]')).not.toBeNull();
    expect(isEnabled(btn)).toBe(false);
  });
  it('detects checkpoint, rate limit and no-permission pages', () => {
    expect(detectPageProblem(document, '/checkpoint/1')?.kind).toBe('fatal');
    document.body.textContent = "You're temporarily blocked";
    expect(detectPageProblem(document, '/groups/1')?.kind).toBe('fatal');
    document.body.textContent = 'Only admins can post';
    expect(detectPageProblem(document, '/groups/1')?.kind).toBe('skip');
    document.body.textContent = 'Hello';
    expect(detectPageProblem(document, '/groups/1')).toBeNull();
  });
  it('waitFor resolves or times out', async () => {
    expect(await waitFor(() => 'x', 100)).toBe('x');
    expect(await waitFor(() => null, 60, 20)).toBeNull();
  });
});
