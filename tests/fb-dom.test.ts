// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanGroupTitle, countCommentEditors, countVisibleCommentText, describeDialogState, detectPageProblem, detectPendingApproval, isComposerSubmitted, findComposerTrigger, findDialogTextbox, findJoinButton, findPostButton, findRecentGroupPosts, findCommentTextbox, findCommentButton, isEnabled, readGroupName, waitFor } from '../src/lib/fb-dom';

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

it('selects only identifiable posts from this group within the last 24 hours', () => {
  document.body.innerHTML = `
    <article><time datetime="2026-11-05T10:00:00Z"></time><a href="https://www.facebook.com/groups/abc/posts/1/">post</a></article>
    <article><time datetime="2026-11-04T09:00:00Z"></time><a href="https://www.facebook.com/groups/abc/posts/2/">old</a></article>
    <article><time datetime="2026-11-05T10:00:00Z"></time><a href="https://evil.example/groups/abc/posts/3/">external</a></article>
    <article><time datetime="2026-11-05T10:00:00Z"></time><a href="https://www.facebook.com/groups/other/posts/4/">other</a></article>
    <article><a href="https://www.facebook.com/groups/abc/posts/5/">no timestamp</a></article>`;
  expect(findRecentGroupPosts(document, 'abc', Date.parse('2026-11-05T12:00:00Z'))).toEqual([
    { url: 'https://www.facebook.com/groups/abc/posts/1/', postedAt: Date.parse('2026-11-05T10:00:00Z') },
  ]);
});

it('reads the Vietnamese absolute date referenced by a Facebook post link', () => {
  document.body.innerHTML = `<span><div aria-hidden="true" id="date">Thứ Năm, 5 Tháng 11, 2026 lúc 14:15</div><a aria-describedby="date" href="https://www.facebook.com/groups/abc/posts/123/?tracking=1">16 phút</a></span>
    <span id="invalid">Thứ Năm, 35 Tháng 11, 2026 lúc 14:15</span><a aria-describedby="invalid" href="https://www.facebook.com/groups/abc/posts/124/">x</a>`;
  expect(findRecentGroupPosts(document, 'abc', new Date(2026, 10, 5, 14, 31).getTime())).toEqual([
    { url: 'https://www.facebook.com/groups/abc/posts/123/', postedAt: new Date(2026, 10, 5, 14, 15).getTime() },
  ]);
});

it('reads relative post timestamps even when the tooltip is absent', () => {
  document.body.innerHTML = `<a href="https://www.facebook.com/groups/abc/posts/123/">16 phút</a>
    <span id="age">2 giờ trước</span><a aria-labelledby="age" href="https://www.facebook.com/groups/abc/posts/124/">x</a>
    <a href="https://www.facebook.com/groups/abc/posts/125/">1 ngày</a>
    <a href="https://www.facebook.com/groups/abc/posts/126/">25 giờ</a>`;
  const now = new Date(2026, 10, 5, 14, 31).getTime();
  expect(findRecentGroupPosts(document, 'abc', now)).toEqual([
    { url: 'https://www.facebook.com/groups/abc/posts/123/', postedAt: now - 16 * 60_000 },
    { url: 'https://www.facebook.com/groups/abc/posts/124/', postedAt: now - 2 * 3_600_000 },
  ]);
});

it('recognizes a single multi_permalinks post only when its timestamp is available', () => {
  document.body.innerHTML = `<span id="age">16 phút trước</span>
    <a aria-labelledby="age" href="https://www.facebook.com/groups/abc/?multi_permalinks=123&amp;other=1">nhiễu</a>
    <a href="https://www.facebook.com/groups/abc/?multi_permalinks=456">nhiễu</a>
    <a aria-labelledby="age" href="https://www.facebook.com/groups/abc/?multi_permalinks=123,456">nhiễu</a>`;
  const now = new Date(2026, 10, 5, 14, 31).getTime();
  expect(findRecentGroupPosts(document, 'abc', now)).toEqual([{ url: 'https://www.facebook.com/groups/abc/posts/123/', postedAt: now - 16 * 60_000 }]);
});

it('reads structured group stories with valid matching IDs and recent creation times', () => {
  const now = Date.parse('2026-11-05T08:43:00Z');
  const story = (id: string, time: number, group = '123') => ({ __typename: 'Story', post_id: id, creation_time: time / 1000, permalink_url: `https://www.facebook.com/groups/123/posts/${id}/`, to: { __typename: 'Group', id: group } });
  const script = document.createElement('script');
  script.type = 'application/json';
  script.textContent = JSON.stringify({ nested: [story('1', now - 60_000), story('2', now - 90_000_000), story('3', now - 60_000, '999')] });
  document.body.appendChild(script);
  expect(findRecentGroupPosts(document, '123', now)).toEqual([{ url: 'https://www.facebook.com/groups/123/posts/1/', postedAt: now - 60_000 }]);
});

it('associates a deferred timestamp link with one post link in the same container', () => {
  document.body.innerHTML = `<section><span id="date">Thứ Năm, 5 Tháng 11, 2026 lúc 14:15</span><a aria-describedby="date" href="https://www.facebook.com/groups/abc/#?deferred">16 phút</a><a href="https://www.facebook.com/groups/abc/posts/123/?comment_id=99">comment</a></section>`;
  const now = new Date(2026, 10, 5, 14, 31).getTime();
  expect(findRecentGroupPosts(document, 'abc', now)).toEqual([{ url: 'https://www.facebook.com/groups/abc/posts/123/', postedAt: new Date(2026, 10, 5, 14, 15).getTime() }]);
  document.querySelector('section')!.insertAdjacentHTML('beforeend', '<a href="https://www.facebook.com/groups/abc/posts/456/">other</a>');
  expect(findRecentGroupPosts(document, 'abc', now)).toEqual([]);
});

it('finds an unambiguous editor and scopes its send button', () => {
  document.body.innerHTML = '<article><div role="textbox" contenteditable="true" aria-label="Write a comment"></div><button aria-label="Post comment">Send</button></article>';
  expect(findCommentButton(findCommentTextbox(document)!)).not.toBeNull();
  document.body.innerHTML += '<form><div role="textbox" contenteditable="true" aria-label="Bình luận dưới tên A"></div></form>';
  expect(findCommentTextbox(document)).toBeNull();
});

it('recognizes the saved Facebook comment editor without treating it as an identifiable post', () => {
  document.body.innerHTML = '<form role="presentation"><div contenteditable="true" role="textbox" data-lexical-editor="true" aria-label="Bình luận dưới tên Trọng"><p><br></p></div></form>';
  expect(countCommentEditors(document)).toBe(1);
  expect(findRecentGroupPosts(document, '123', Date.now())).toEqual([]);
  const textbox = findCommentTextbox(document)!;
  expect(findCommentButton(textbox)).toBeNull();
  document.body.insertAdjacentHTML('beforeend', '<button aria-label="Gửi"></button>');
  expect(findCommentButton(textbox)).toBeNull();
  textbox.closest('form')!.insertAdjacentHTML('beforeend', '<div role="button" aria-label="Đăng bình luận"></div>');
  expect(findCommentButton(textbox)?.getAttribute('aria-label')).toBe('Đăng bình luận');
});

it('only counts visible matching comment text outside the editor', () => {
  document.body.innerHTML = '<div dir="auto">Xin chào</div><div dir="auto">Xin chào</div><div contenteditable="true"><div dir="auto">Xin chào</div></div>';
  const visible = document.querySelector<HTMLElement>('[dir="auto"]')!;
  visible.getClientRects = () => [{ } as DOMRect] as unknown as DOMRectList;
  document.querySelectorAll<HTMLElement>('[dir="auto"]')[1]!.getClientRects = () => [] as unknown as DOMRectList;
  expect(countVisibleCommentText(document, 'Xin chào')).toBe(1);
});

it('detects a pending-approval notice in English and Vietnamese', () => {
  document.body.textContent = 'Your post is pending approval.';
  expect(detectPendingApproval(document)).toBe(true);
  document.body.textContent = 'Bài viết của bạn đang chờ phê duyệt'.normalize('NFD');
  expect(detectPendingApproval(document)).toBe(true);
  document.body.textContent = 'Bài viết của bạn đã được đăng.';
  expect(detectPendingApproval(document)).toBe(false);
  document.body.textContent = 'Pending posts';
  expect(detectPendingApproval(document)).toBe(false);
});
