// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanGroupTitle, countCommentEditors, countVisibleCommentText, describeDialogState, detectPageProblem, detectPendingApproval, isComposerSubmitted, findComposerTrigger, findDialogTextbox, findJoinButton, findPostButton, findRecentGroupPosts, findNewestFeedPosts, postFingerprint, findCommentTextbox, findCommentButton, describeCommentButtons, pressEnter, describeFeedItems, insertLines, keptLineBreaks, pasteText, isDuplicatedText, hasLineBreaks, findImageInput, findPhotoButton, findLinkPreviewCloseButton, countComposerImages, isComposerBusy, setInputFiles, isEnabled, readGroupName, waitFor } from '../src/lib/fb-dom';

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

describe('fb-dom: image attachments', () => {
  it('finds an image file input inside the composer dialog', () => {
    document.body.innerHTML = '<input type="file" accept="image/*"><div role="dialog"><input id="in" type="file" accept="image/*,video/*"></div>';
    expect(findImageInput(document)?.id).toBe('in');
  });
  it('ignores inputs that do not accept images and inputs outside a dialog', () => {
    document.body.innerHTML = '<div role="dialog"><input type="file" accept="video/*"><input type="file" accept=".pdf"></div><input type="file" accept="image/*">';
    expect(findImageInput(document)).toBeNull();
  });
  it('accepts a file input with no accept filter only when it is not clearly for another type', () => {
    document.body.innerHTML = '<div role="dialog"><input id="any" type="file"></div>';
    expect(findImageInput(document)).toBeNull();
  });
  it('finds the photo button in English and Vietnamese, only in a dialog', () => {
    document.body.innerHTML = '<div role="dialog"><div role="button" aria-label="Photo/video">x</div></div>';
    expect(findPhotoButton(document)).not.toBeNull();
    document.body.innerHTML = '<div role="dialog"><div role="button" aria-label="Ảnh/video"></div></div>';
    expect(findPhotoButton(document)).not.toBeNull();
    document.body.innerHTML = '<div role="button" aria-label="Photo/video"></div>';
    expect(findPhotoButton(document)).toBeNull();
  });
  it('sets files on an input and fires input and change events', () => {
    document.body.innerHTML = '<div role="dialog"><input id="in" type="file" accept="image/*" multiple></div>';
    const input = document.getElementById('in') as HTMLInputElement;
    const seen: string[] = [];
    input.addEventListener('input', () => seen.push('input'));
    input.addEventListener('change', () => seen.push('change'));
    const files = [new File([new Uint8Array([1])], 'a.png', { type: 'image/png' }), new File([new Uint8Array([2])], 'b.jpg', { type: 'image/jpeg' })];
    expect(setInputFiles(input, files)).toBe(true);
    expect(input.files?.length).toBe(2);
    expect(seen).toEqual(['input', 'change']);
  });
  it('counts local image previews inside the dialog only', () => {
    document.body.innerHTML = '<img src="blob:https://www.facebook.com/1"><div role="dialog"><img src="blob:https://www.facebook.com/2"><img src="data:image/png;base64,AAAA"><img src="https://example.com/x.png"></div>';
    expect(countComposerImages(document)).toBe(2);
  });
  it('reports the composer as busy while an upload progress bar is shown', () => {
    document.body.innerHTML = '<div role="dialog"><div role="progressbar"></div></div>';
    expect(isComposerBusy(document)).toBe(true);
    document.body.innerHTML = '<div role="dialog"><div aria-busy="true"></div></div>';
    expect(isComposerBusy(document)).toBe(true);
    document.body.innerHTML = '<div role="dialog"><div role="textbox"></div></div>';
    expect(isComposerBusy(document)).toBe(false);
    document.body.innerHTML = '<div role="progressbar"></div>';
    expect(isComposerBusy(document)).toBe(false);
  });
});

describe('fb-dom: link preview card', () => {
  it('finds the close button of the preview in English and Vietnamese', () => {
    document.body.innerHTML = '<div role="dialog"><div role="button" aria-label="Remove preview"></div></div>';
    expect(findLinkPreviewCloseButton(document)).not.toBeNull();
    document.body.innerHTML = '<div role="dialog"><div role="button" aria-label="Xóa bản xem trước"></div></div>';
    expect(findLinkPreviewCloseButton(document)).not.toBeNull();
    document.body.innerHTML = `<div role="dialog"><div role="button" aria-label="${'Xóa bản xem trước'.normalize('NFD')}"></div></div>`;
    expect(findLinkPreviewCloseButton(document)).not.toBeNull();
  });
  it('returns null when there is no preview card', () => {
    document.body.innerHTML = '<div role="dialog"><div role="button" aria-label="Đóng"></div><div role="button" aria-label="Đăng">Đăng</div></div>';
    expect(findLinkPreviewCloseButton(document)).toBeNull();
    document.body.innerHTML = '';
    expect(findLinkPreviewCloseButton(document)).toBeNull();
  });
  it('does not look outside dialogs', () => {
    document.body.innerHTML = '<div role="button" aria-label="Remove preview"></div>';
    expect(findLinkPreviewCloseButton(document)).toBeNull();
  });
});

describe('fb-dom: multi-line text', () => {
  const record = () => {
    const calls: string[] = [];
    const exec = (command: string, value?: string): boolean => {
      calls.push(value === undefined ? command : `${command}:${value}`);
      return true;
    };
    return { calls, exec };
  };
  it('types each line and starts a new paragraph between lines', () => {
    const { calls, exec } = record();
    insertLines(exec, 'A\nB\n\nC');
    expect(calls).toEqual(['insertText:A', 'insertParagraph', 'insertText:B', 'insertParagraph', 'insertParagraph', 'insertText:C', ]);
  });
  it('handles Windows line endings and a trailing newline', () => {
    const { calls, exec } = record();
    insertLines(exec, 'A\r\nB\n');
    expect(calls).toEqual(['insertText:A', 'insertParagraph', 'insertText:B', 'insertParagraph']);
  });
  it('types a single line without any paragraph command', () => {
    const { calls, exec } = record();
    insertLines(exec, 'Xin chào');
    expect(calls).toEqual(['insertText:Xin chào']);
  });
  it('reports lost line breaks only when the text had some', () => {
    document.body.innerHTML = '<div id="tb" contenteditable="true"></div>';
    const box = document.getElementById('tb') as HTMLElement;
    Object.defineProperty(box, 'innerText', { value: 'AB', configurable: true });
    expect(keptLineBreaks(box, 'A\nB')).toBe(false);
    expect(keptLineBreaks(box, 'AB')).toBe(true);
    Object.defineProperty(box, 'innerText', { value: 'A\nB', configurable: true });
    expect(keptLineBreaks(box, 'A\nB')).toBe(true);
  });
  it('pastes plain text through a paste event', () => {
    document.body.innerHTML = '<div id="tb" contenteditable="true"></div>';
    const box = document.getElementById('tb') as HTMLElement;
    let received = '';
    box.addEventListener('paste', (e) => { received = (e as ClipboardEvent).clipboardData?.getData('text/plain') ?? ''; });
    pasteText(box, 'A\nB');
    expect(received).toBe('A\nB');
  });
});

describe('fb-dom: duplicated or multi-line text checks', () => {
  const post = 'NĂNG LỰC CỦA DOANH NGHIỆP\nGửi đường link website cho khách hàng mới\n\nHotline: 077 317 5996';
  it('detects text that was entered twice', () => {
    expect(isDuplicatedText(post + post, post)).toBe(true);
    expect(isDuplicatedText(post.replace(/\n/g, '') + post, post)).toBe(true);
  });
  it('accepts the text once, whatever the whitespace', () => {
    expect(isDuplicatedText(post, post)).toBe(false);
    expect(isDuplicatedText(post.replace(/\n/g, ' '), post)).toBe(false);
    expect(isDuplicatedText(post.replace(/\n/g, ''), post)).toBe(false);
  });
  it('ignores very short text', () => {
    expect(isDuplicatedText('abab', 'ab')).toBe(false);
  });
  it('knows whether a text has line breaks', () => {
    expect(hasLineBreaks('A\nB')).toBe(true);
    expect(hasLineBreaks('A\r\nB')).toBe(true);
    expect(hasLineBreaks('A')).toBe(false);
    expect(hasLineBreaks('A\n')).toBe(false);
    expect(hasLineBreaks('\n\nA')).toBe(false);
  });
});

describe('newest feed posts', () => {
  const item = (author: string, body: string, editors = 1) =>
    `<div><div dir="auto">${body}</div><div role="button" aria-label="Bình luận về bài viết của ${author}">Bình luận</div>` +
    '<div role="textbox" contenteditable="true" aria-label="Viết bình luận"></div>'.repeat(editors) + '</div>';

  it('finds feed items that have exactly one comment editor, in page order', () => {
    document.body.innerHTML = `<div role="feed"><div></div>${item('Lan', 'Bài một')}${item('Minh', 'Bài hai')}</div>`;
    const found = findNewestFeedPosts(document);
    expect(found).toHaveLength(2);
    expect(found[0]!.fingerprint).toBe(postFingerprint('Lan', 'Bài một'));
    expect(found[1]!.fingerprint).toBe(postFingerprint('Minh', 'Bài hai'));
  });

  it('reads the author from the label even when it ends with a comment count', () => {
    document.body.innerHTML = `<div role="feed">${item('Em Anth, 1 bình luận', 'Nội dung')}</div>`;
    expect(findNewestFeedPosts(document)[0]!.fingerprint).toBe(postFingerprint('Em Anth', 'Nội dung'));
  });

  it('skips items without an editor, with several editors, or without a comment button', () => {
    document.body.innerHTML = `<div role="feed">${item('A', 'x', 0)}${item('B', 'y', 2)}<div><div dir="auto">z</div><div contenteditable="true"></div></div></div>`;
    expect(findNewestFeedPosts(document)).toEqual([]);
  });

  it('only looks at the first items of the feed', () => {
    document.body.innerHTML = `<div role="feed">${'<div></div>'.repeat(8)}${item('Late', 'too far down')}</div>`;
    expect(findNewestFeedPosts(document)).toEqual([]);
  });

  it('returns nothing when the page has no feed', () => {
    document.body.innerHTML = item('Lan', 'x');
    expect(findNewestFeedPosts(document)).toEqual([]);
  });

  it('gives different posts different fingerprints without containing the text', () => {
    expect(postFingerprint('Lan', 'a')).not.toBe(postFingerprint('Lan', 'b'));
    expect(postFingerprint('Lan', 'Cần mua laptop cũ')).toMatch(/^[0-9a-z]{1,8}$/);
  });
});

it('finds the send button next to a feed editor and ignores the action-bar comment button', () => {
  document.body.innerHTML = '<div role="feed"><div role="article"><div role="button" aria-label="Bình luận"></div><div><div role="textbox" contenteditable="true" aria-label="Viết bình luận"></div><div role="button" aria-label="Bình luận" id="send"></div></div></div></div>';
  const textbox = document.querySelector<HTMLElement>('[role="textbox"]')!;
  expect(findCommentButton(textbox)?.id).toBe('send');
  expect(describeCommentButtons(textbox)).toContain('Bình luận');
});

it('explains why feed items were rejected', () => {
  document.body.innerHTML = '<div role="feed"><div><div contenteditable="true"></div><div role="button" aria-label="Bình luận"></div><div dir="auto">Xin chào</div></div><div></div></div>';
  expect(describeFeedItems(document)).toBe('#1: ô=1, nút bình luận=1, chữ=có; #2: ô=0, nút bình luận=0, chữ=không');
});

it('gives posts by one author different fingerprints even when the text has no leaf element', () => {
  const post = (text: string) => `<div><div role="button" aria-label="Bình luận về bài viết của Em Anth"></div><div contenteditable="true"></div><div dir="auto"><div>${text}</div></div></div>`;
  document.body.innerHTML = `<div role="feed">${post('Bài một')}${post('Bài hai')}</div>`;
  const [a, b] = findNewestFeedPosts(document);
  expect(a!.fingerprint).not.toBe(b!.fingerprint);
});

it('presses Enter as keydown, keypress and keyup', () => {
  document.body.innerHTML = '<div id="box" contenteditable="true"></div>';
  const seen: string[] = [];
  const box = document.getElementById('box')!;
  for (const type of ['keydown', 'keypress', 'keyup']) box.addEventListener(type, (e) => seen.push(`${e.type}:${(e as KeyboardEvent).key}`));
  pressEnter(box);
  expect(seen).toEqual(['keydown:Enter', 'keypress:Enter', 'keyup:Enter']);
});
