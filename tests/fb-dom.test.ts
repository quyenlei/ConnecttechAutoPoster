// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanGroupTitle, countVisibleCommentText, describeDialogState, detectPageProblem, detectPendingApproval, isComposerSubmitted, findComposerTrigger, findDialogTextbox, findJoinButton, findPostButton, postFingerprint, findCommentButton, describeCommentButtons, pressEnter, pressEscape, parseAgeLabel, parseFacebookDate, readStructuredPostTimes, findFeedItems, isFeedItemRendered, readFeedPost, findMyName, hasMyComment, findItemEditor, findItemCommentAction, findTimestampTargets, hoverOver, hoverOut, findDialogCommentEditor, type FeedReadContext, insertLines, keptLineBreaks, pasteText, isDuplicatedText, hasLineBreaks, findImageInput, findPhotoButton, findLinkPreviewCloseButton, countComposerImages, isComposerBusy, setInputFiles, isEnabled, readGroupName, waitFor } from '../src/lib/fb-dom';

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

describe('post time labels', () => {
  const now = new Date(2026, 10, 5, 14, 31).getTime();
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  it('reads relative labels in Vietnamese and English, with the rounding range', () => {
    expect(parseAgeLabel('47 phút', now)).toEqual({ minAgeMs: 47 * MIN, maxAgeMs: 48 * MIN });
    expect(parseAgeLabel('3 giờ trước', now)).toEqual({ minAgeMs: 3 * HOUR, maxAgeMs: 4 * HOUR });
    expect(parseAgeLabel('5m', now)).toEqual({ minAgeMs: 5 * MIN, maxAgeMs: 6 * MIN });
    expect(parseAgeLabel('2 hours ago', now)).toEqual({ minAgeMs: 2 * HOUR, maxAgeMs: 3 * HOUR });
    expect(parseAgeLabel('1 ngày', now)).toEqual({ minAgeMs: DAY, maxAgeMs: 2 * DAY });
    expect(parseAgeLabel('2 tuần', now)?.minAgeMs).toBe(14 * DAY);
    expect(parseAgeLabel('Vừa xong', now)).toEqual({ minAgeMs: 0, maxAgeMs: MIN });
  });

  it('reads yesterday and absolute dates', () => {
    expect(parseAgeLabel('Hôm qua lúc 20:31', now)).toEqual({ minAgeMs: 18 * HOUR, maxAgeMs: 18 * HOUR });
    const yesterday = parseAgeLabel('Hôm qua', now)!;
    expect(yesterday.minAgeMs).toBe(14 * HOUR + 31 * MIN);
    expect(yesterday.maxAgeMs).toBe(DAY + 14 * HOUR + 31 * MIN);
    expect(parseAgeLabel('Thứ Năm, 5 Tháng 11, 2026 lúc 14:15', now)).toEqual({ minAgeMs: 16 * MIN, maxAgeMs: 16 * MIN, absolute: true });
    expect(parseAgeLabel('5 Tháng 11 lúc 14:15', now)?.minAgeMs).toBe(16 * MIN);
    expect(parseFacebookDate('Thursday, November 5, 2026 at 2:15 PM', now)).toBe(new Date(2026, 10, 5, 14, 15).getTime());
  });

  it('reads "khoảng" / "about" labels and marks absolute dates', () => {
    expect(parseAgeLabel('khoảng 1 phút trước', now)).toEqual({ minAgeMs: MIN, maxAgeMs: 2 * MIN });
    expect(parseAgeLabel('about 3 hours ago', now)?.minAgeMs).toBe(3 * HOUR);
    expect(parseAgeLabel('Thứ Năm, 5 Tháng 11, 2026 lúc 14:15', now)?.absolute).toBe(true);
    expect(parseAgeLabel('47 phút', now)?.absolute).toBeUndefined();
  });

  it('rejects text that is not a time', () => {
    expect(parseAgeLabel('Nguyễn Văn A', now)).toBeNull();
    expect(parseAgeLabel('Facebook', now)).toBeNull();
    expect(parseAgeLabel('Thứ Năm, 35 Tháng 11, 2026 lúc 14:15', now)).toBeNull();
    expect(parseAgeLabel('', now)).toBeNull();
  });
});

describe('feed posts', () => {
  const now = new Date(2026, 10, 5, 14, 31).getTime();
  const ctx = (extra: Partial<FeedReadContext> = {}): FeedReadContext => ({ groupId: 'abc', now, myName: null, ownTexts: [], ...extra });
  const item = (inner: string) => `<div role="feed"><div class="item">${inner}</div></div>`;
  const first = () => findFeedItems(document)[0]!;
  const editor = '<form><div role="textbox" contenteditable="true" aria-label="Bình luận dưới tên Trọng"></div></form>';
  const header = (author: string, time = '') => `<h3><a href="/groups/abc/user/1/">${author}</a></h3>${time}`;

  it('lists the direct children of the feed and tells placeholders apart', () => {
    document.body.innerHTML = '<div role="feed"><div></div><div><div dir="auto">Bài</div></div></div>';
    const items = findFeedItems(document);
    expect(items).toHaveLength(2);
    expect(isFeedItemRendered(items[0]!)).toBe(false);
    expect(isFeedItemRendered(items[1]!)).toBe(true);
  });

  it('reads author, text, age and editor of a post without a link', () => {
    document.body.innerHTML = item(`${header('Lan', '<span>47 phút</span>')}<div dir="auto">Cần mua laptop cũ</div>${editor}`);
    const post = readFeedPost(first(), ctx());
    expect(post.fingerprint).toBe(postFingerprint('Lan', 'Cần mua laptop cũ'));
    expect(post.url).toBeNull();
    expect(post.age).toMatchObject({ minAgeMs: 47 * 60_000, maxAgeMs: 48 * 60_000, label: "47 phút" });
    expect(post.editor).not.toBeNull();
    expect(post.mine).toBe(false);
  });

  it('reads the post link and its time from a tooltip', () => {
    document.body.innerHTML = item(`${header('Lan')}<span id="tip">Thứ Năm, 5 Tháng 11, 2026 lúc 14:15</span><a aria-describedby="tip" href="https://www.facebook.com/groups/abc/posts/123/?__cft__=x">16 phút</a><div dir="auto">Nội dung</div>${editor}`);
    const post = readFeedPost(first(), ctx());
    expect(post.url).toBe('https://www.facebook.com/groups/abc/posts/123/');
    expect(post.age?.minAgeMs).toBe(16 * 60_000);
  });

  it('prefers the relative label over a tooltip date rendered in another time zone (seen live)', () => {
    // Live markup (2026-11-10): the first page load had the tooltip in US Pacific time, 15 hours off.
    document.body.innerHTML = item(`${header('Lan')}<span id="rel">khoảng 1 phút trước</span><span id="abs">Thứ Tư, 4 Tháng 11, 2026 lúc 23:30</span>
      <a role="link" aria-labelledby="rel" aria-describedby="abs" href="?__cft__[0]=x">1 phút</a><div dir="auto">Nội dung</div>${editor}`);
    expect(readFeedPost(first(), ctx()).age).toMatchObject({ minAgeMs: 60_000, maxAgeMs: 120_000, label: 'khoảng 1 phút trước' });
  });

  it('uses structured times for a post with a known link', () => {
    document.body.innerHTML = item(`${header('Lan')}<a href="https://www.facebook.com/groups/abc/posts/9/">x</a><div dir="auto">Nội dung</div>`);
    const structured = new Map([['https://www.facebook.com/groups/abc/posts/9/', now - 5 * 60_000]]);
    expect(readFeedPost(first(), ctx({ structured })).age).toMatchObject({ minAgeMs: 5 * 60_000, maxAgeMs: 5 * 60_000 });
  });

  it('ignores times, links and text that belong to comments', () => {
    document.body.innerHTML = item(`${header('Lan')}<div dir="auto">Bài chính</div><div role="button" aria-label="Bình luận">Bình luận</div>
      <div role="article" aria-label="Bình luận dưới tên Minh"><a href="/groups/abc/posts/5/?comment_id=1">2 phút</a><div dir="auto">Một bình luận dài hơn nội dung bài</div></div>`);
    const post = readFeedPost(first(), ctx());
    expect(post.age).toBeNull();
    expect(post.url).toBeNull();
    expect(post.fingerprint).toBe(postFingerprint('Lan', 'Bài chính'));
  });

  it('keeps the fingerprint when comments load or "Xem thêm" is pressed', () => {
    document.body.innerHTML = item(`${header('Lan')}<div dir="auto">Bài dài … Xem thêm</div>${editor}`);
    const before = readFeedPost(first(), ctx()).fingerprint;
    document.body.innerHTML = item(`${header('Lan')}<div dir="auto">Bài dài</div><div role="article" aria-label="Bình luận dưới tên B"><div dir="auto">Bình luận rất rất rất dài, dài hơn bài viết nhiều</div></div>${editor}`);
    expect(readFeedPost(first(), ctx()).fingerprint).toBe(before);
  });

  it('reads the story message and ignores the hidden filler Facebook adds to every post (seen live)', () => {
    const post = (text: string) => item(`<div data-ad-rendering-role="profile_name"><a href="/groups/abc/user/1/"><b><span>Lê Trọng</span></b></a></div>
      <blockquote><span dir="auto">${'<span>Facebook</span>'.repeat(5)}</span></blockquote><span dir="auto"><span>t</span><span>͏</span></span>
      <div data-ad-rendering-role="story_message"><div dir="auto">${text}</div></div>${editor}`);
    document.body.innerHTML = post('Test 12');
    const a = readFeedPost(first(), ctx()).fingerprint;
    document.body.innerHTML = post('Test 11');
    const b = readFeedPost(first(), ctx()).fingerprint;
    expect(a).toBe(postFingerprint('Lê Trọng', 'Test 12'));
    expect(a).not.toBe(b);
  });

  it('skips filler text when there is no story message marker', () => {
    document.body.innerHTML = item(`${header('Lan')}<blockquote><span dir="auto">Facebook Facebook</span></blockquote><span dir="auto">Facebook</span><div dir="auto">Bài thật</div>`);
    expect(readFeedPost(first(), ctx()).fingerprint).toBe(postFingerprint('Lan', 'Bài thật'));
  });

  it('reads the author from the comment button label first, as earlier versions did', () => {
    document.body.innerHTML = item(`<div dir="auto">Nội dung</div><div role="button" aria-label="Bình luận về bài viết của Em Anth, 1 bình luận">Bình luận</div>`);
    expect(readFeedPost(first(), ctx()).fingerprint).toBe(postFingerprint('Em Anth', 'Nội dung'));
  });

  it('treats an unlabelled article inside the item as the post, not as a comment', () => {
    document.body.innerHTML = item(`<div role="article">${header('Lan', '<span>3 giờ</span>')}<div dir="auto">Bài</div>${editor}<div role="article"><div dir="auto">bình luận</div></div></div>`);
    const post = readFeedPost(first(), ctx());
    expect(post.age?.minAgeMs).toBe(3 * 3_600_000);
    expect(post.editor).not.toBeNull();
  });

  it('finds the comment button of a post without an editor, and not the send button of a form', () => {
    document.body.innerHTML = item(`<div dir="auto">Bài</div><div role="button" aria-label="Thích"></div><div role="button">Bình luận</div>`);
    expect(findItemCommentAction(first())?.textContent).toBe('Bình luận');
    expect(findItemEditor(first())).toBeNull();
    document.body.innerHTML = item(`<div dir="auto">Bài</div><form><div contenteditable="true"></div><div role="button" aria-label="Bình luận"></div></form>`);
    expect(findItemCommentAction(first())).toBeNull();
  });

  it('ignores reply editors inside comments when finding the post editor', () => {
    document.body.innerHTML = item(`<div dir="auto">Bài</div>${editor}<div role="article" aria-label="Bình luận dưới tên B"><div contenteditable="true"></div></div>`);
    expect(findItemEditor(first())?.getAttribute('aria-label')).toBe('Bình luận dưới tên Trọng');
  });
});

describe('own comments', () => {
  const comment = (who: string, text: string) => `<div role="article" aria-label="Bình luận dưới tên ${who}"><a href="/u">${who}</a><div dir="auto">${text}</div></div>`;

  it('reads the user name from the comment editor label', () => {
    document.body.innerHTML = '<div contenteditable="true" role="textbox" aria-label="Bình luận dưới tên Lê Hoàng Trọng"></div>';
    expect(findMyName(document)).toBe('Lê Hoàng Trọng');
    document.body.innerHTML = '<div contenteditable="true" aria-label="Comment as Jane Doe"></div>';
    expect(findMyName(document)).toBe('Jane Doe');
    document.body.innerHTML = '<div contenteditable="true" aria-label="Viết bình luận"></div>';
    expect(findMyName(document)).toBeNull();
  });

  it('sees a comment by the user or with a campaign text', () => {
    document.body.innerHTML = `<div id="a">${comment('Trọng', 'hay quá')}</div><div id="b">${comment('Minh', 'Liên hệ mình nhé')}</div><div id="c">${comment('Minh', 'khác')}</div>`;
    const el = (id: string) => document.getElementById(id)!;
    expect(hasMyComment(el('a'), 'Trọng', [])).toBe(true);
    expect(hasMyComment(el('b'), 'Trọng', ['  liên hệ  mình nhé '])).toBe(true);
    expect(hasMyComment(el('c'), 'Trọng', ['Liên hệ mình nhé'])).toBe(false);
    expect(hasMyComment(el('c'), null, [])).toBe(false);
  });
});

describe('post time behind a hover', () => {
  it('offers header elements but not profile links or comment links', () => {
    document.body.innerHTML = `<div role="feed"><div><h3><a href="/groups/abc/user/1/">Lan</a></h3><a href="https://www.facebook.com/lan.nguyen">Lan</a><span role="link" id="t">Facebook</span><a href="#" id="h">x</a>
      <div dir="auto">Bài</div><form><div contenteditable="true"></div></form><a href="#" id="late">sau ô bình luận</a></div></div>`;
    const ids = findTimestampTargets(findFeedItems(document)[0]!).map((el) => el.id);
    expect(ids).toEqual(['t', 'h']);
  });

  it('sends pointer and mouse events over and out of one element', () => {
    document.body.innerHTML = '<div id="outer"><span id="t">x</span></div>';
    const seen: string[] = [];
    for (const type of ['pointerover', 'mouseover', 'mouseout', 'pointerout']) document.getElementById('outer')!.addEventListener(type, (e) => seen.push(e.type));
    const target = document.getElementById('t')!;
    target.addEventListener('mouseenter', (e) => seen.push(e.type));
    hoverOver(target);
    hoverOut(target);
    expect(seen).toEqual(['pointerover', 'mouseover', 'mouseenter', 'pointerout', 'mouseout']);
  });
});

it('reads structured group stories with matching IDs', () => {
  const now = Date.parse('2026-11-05T08:43:00Z');
  const story = (id: string, time: number, group = '123') => ({ __typename: 'Story', post_id: id, creation_time: time / 1000, permalink_url: `https://www.facebook.com/groups/123/posts/${id}/`, to: { __typename: 'Group', id: group } });
  const script = document.createElement('script');
  script.type = 'application/json';
  script.textContent = JSON.stringify({ nested: [story('1', now - 60_000), story('3', now - 60_000, '999')] });
  document.body.appendChild(script);
  expect([...readStructuredPostTimes(document, '123')]).toEqual([['https://www.facebook.com/groups/123/posts/1/', now - 60_000]]);
});

it('finds the single comment editor of the newest dialog', () => {
  document.body.innerHTML = '<div role="dialog"><div contenteditable="true" aria-label="Viết bình luận"></div></div><div role="dialog"><div contenteditable="true" aria-label="Bình luận dưới tên A" id="x"></div></div>';
  expect(findDialogCommentEditor(document)?.id).toBe('x');
});

it('scopes the send button of a comment editor', () => {
  document.body.innerHTML = '<form role="presentation"><div contenteditable="true" role="textbox" aria-label="Bình luận dưới tên Trọng"><p><br></p></div></form>';
  const textbox = document.querySelector<HTMLElement>('[role="textbox"]')!;
  expect(findCommentButton(textbox)).toBeNull();
  document.body.insertAdjacentHTML('beforeend', '<button aria-label="Gửi"></button>');
  expect(findCommentButton(textbox)).toBeNull();
  textbox.closest('form')!.insertAdjacentHTML('beforeend', '<div role="button" aria-label="Đăng bình luận"></div>');
  expect(findCommentButton(textbox)?.getAttribute('aria-label')).toBe('Đăng bình luận');
});

it('presses Escape as keydown and keyup', () => {
  document.body.innerHTML = '<div id="box"></div>';
  const seen: string[] = [];
  const box = document.getElementById('box')!;
  for (const type of ['keydown', 'keyup']) box.addEventListener(type, (e) => seen.push(`${e.type}:${(e as KeyboardEvent).key}`));
  pressEscape(box);
  expect(seen).toEqual(['keydown:Escape', 'keyup:Escape']);
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

it('finds the send button next to a feed editor and ignores the action-bar comment button', () => {
  document.body.innerHTML = '<div role="feed"><div role="article"><div role="button" aria-label="Bình luận"></div><div><div role="textbox" contenteditable="true" aria-label="Viết bình luận"></div><div role="button" aria-label="Bình luận" id="send"></div></div></div></div>';
  const textbox = document.querySelector<HTMLElement>('[role="textbox"]')!;
  expect(findCommentButton(textbox)?.id).toBe('send');
  expect(describeCommentButtons(textbox)).toContain('Bình luận');
});

it('gives posts by one author different fingerprints even when the text has no leaf element', () => {
  const post = (text: string) => `<div><div role="button" aria-label="Bình luận về bài viết của Em Anth"></div><div contenteditable="true"></div><div dir="auto"><div>${text}</div></div></div>`;
  document.body.innerHTML = `<div role="feed">${post('Bài một')}${post('Bài hai')}</div>`;
  const [a, b] = findFeedItems(document).map((el) => readFeedPost(el, { groupId: 'g', now: Date.now(), myName: null, ownTexts: [] }));
  expect(a!.fingerprint).not.toBe(b!.fingerprint);
});

it('gives different posts different fingerprints without containing the text', () => {
  expect(postFingerprint('Lan', 'a')).not.toBe(postFingerprint('Lan', 'b'));
  expect(postFingerprint('Lan', 'Cần mua laptop cũ')).toMatch(/^[0-9a-z]{1,8}$/);
});

it('presses Enter as keydown, keypress and keyup', () => {
  document.body.innerHTML = '<div id="box" contenteditable="true"></div>';
  const seen: string[] = [];
  const box = document.getElementById('box')!;
  for (const type of ['keydown', 'keypress', 'keyup']) box.addEventListener(type, (e) => seen.push(`${e.type}:${(e as KeyboardEvent).key}`));
  pressEnter(box);
  expect(seen).toEqual(['keydown:Enter', 'keypress:Enter', 'keyup:Enter']);
});
