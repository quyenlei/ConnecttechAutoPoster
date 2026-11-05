// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanGroupTitle, describeDialogState, detectPageProblem, isComposerSubmitted, findComposerTrigger, findDialogTextbox, findJoinButton, findPostButton, isEnabled, readGroupName, waitFor } from '../src/lib/fb-dom';

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
  it('describes the dialog state without leaking post text', () => {
    document.body.innerHTML = '';
    expect(describeDialogState(document)).toBe('không còn hộp thoại');
    document.body.innerHTML =
      '<div role="dialog" aria-label="Nội quy nhóm"><div role="textbox" contenteditable="true">bí mật của tôi</div>' +
      '<div role="button" aria-label="Đăng" aria-disabled="true">Đăng</div></div>';
    const state = describeDialogState(document);
    expect(state).toContain('1 hộp thoại');
    expect(state).toContain('nút Đăng đang khóa');
    expect(state).toContain('Nội quy nhóm');
    expect(state).not.toContain('bí mật');
  });
  it('treats a closed dialog or an emptied textbox as submitted', () => {
    document.body.innerHTML = '';
    expect(isComposerSubmitted(document)).toBe(true);
    document.body.innerHTML = '<div role="dialog"><div role="textbox" contenteditable="true">xin chào</div></div>';
    expect(isComposerSubmitted(document)).toBe(false);
    document.body.innerHTML = '<div role="dialog"><div role="textbox" contenteditable="true"> </div></div>';
    expect(isComposerSubmitted(document)).toBe(true);
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

describe('group name', () => {
  it('cleans the page title', () => {
    expect(cleanGroupTitle('(3) Hội Du Học Nhật | Facebook')).toBe('Hội Du Học Nhật');
    expect(cleanGroupTitle('Hội Du Học Nhật - Facebook')).toBe('Hội Du Học Nhật');
    expect(cleanGroupTitle('(20+) Study Abroad – Facebook')).toBe('Study Abroad');
    expect(cleanGroupTitle('Plain name')).toBe('Plain name');
  });
  it('rejects generic titles', () => {
    for (const t of ['Facebook', '', '   ', 'Log in to Facebook', 'Đăng nhập Facebook', '(1) Facebook']) expect(cleanGroupTitle(t)).toBeNull();
  });
  it('reads the name from the title, then from the first heading', () => {
    document.title = '(2) Nhóm A | Facebook';
    expect(readGroupName(document)).toBe('Nhóm A');
    document.title = 'Facebook';
    document.body.innerHTML = '<h1>  Nhóm B </h1>';
    expect(readGroupName(document)).toBe('Nhóm B');
    document.body.innerHTML = '';
    expect(readGroupName(document)).toBeNull();
  });
});
