"""Smoke test: loads the built extension in Chromium and runs a full campaign
against a LOCAL MOCK of a Facebook group page. DNS is remapped so *.facebook.com
resolves to 127.0.0.1 and every other host fails: no real network traffic.
Usage: python3 e2e/smoke.py <ext_dir> <chromium_exe> <profile_dir>"""
import hashlib, http.server, os, ssl, subprocess, sys, tempfile, threading, time, urllib.parse
from playwright.sync_api import sync_playwright

MOCK = """<!doctype html><html><head><title>(2) Mock Group Name | Facebook</title></head><body><h1>Mock group</h1>
<div role="button" id="open">Write something...</div>
<script>
setTimeout(()=>{
  if (location.pathname.split('/')[2] === 'mockempty') return; // a group with no recent post
  const article=document.createElement('article'); article.setAttribute('role', 'article');
  const feedOnly = location.pathname.split('/')[2] === 'mockfeed'; // newest-posts mode: a feed with no post link, time or article role
  let host = article;
  if (feedOnly) {
    host = document.createElement('div');
    host.innerHTML='<div dir="auto">Bài không có liên kết</div><div role="button" aria-label="Bình luận về bài viết của Lan, 1 bình luận">Bình luận</div><form><div role="textbox" contenteditable="true" aria-label="Write a comment" id="comment"></div><button type="button" aria-label="Post comment" id="send-comment">Gửi</button></form>';
    const feed = document.createElement('div'); feed.setAttribute('role', 'feed'); feed.appendChild(document.createElement('div')); feed.appendChild(host);
    document.body.appendChild(feed);
  } else {
    article.innerHTML='<time id="published"></time><a id="post-link">Bài viết</a><div role="textbox" contenteditable="true" aria-label="Write a comment" id="comment"></div><button aria-label="Post comment" id="send-comment">Gửi</button>';
    document.body.appendChild(article);
    document.getElementById('published').setAttribute('datetime', new Date().toISOString());
    document.getElementById('post-link').href = '/groups/' + location.pathname.split('/')[2] + '/posts/123/';
  }
  document.getElementById('send-comment').onclick=()=>{ const el=document.getElementById('comment'); fetch('/__comment?t='+encodeURIComponent(el.textContent)); const result=document.createElement('div'); result.dir='auto'; result.textContent=el.textContent; host.appendChild(result); el.textContent=''; };
}, 2000);
document.getElementById('open').onclick=()=>{
  const d=document.createElement('div'); d.setAttribute('role','dialog');
  const slug = location.pathname.split('/')[2];
  // The group "mocknoimg" has a composer without an image input.
  d.innerHTML='<div role="textbox" contenteditable="true" id="tb"></div>' + (slug === 'mocknoimg' ? '' : '<input type="file" accept="image/*,video/*" multiple id="img">') + '<div role="button" aria-label="Post" id="post">Post</div>';
  document.body.appendChild(d);
  const tb=document.getElementById('tb');
  // Editors like Facebook's: a paste of plain text keeps its lines. The group "mockpasteonly" flattens blocks made by
  // typing (so only a paste keeps the lines); "mocklostbreaks" loses the lines either way, like the failure seen live.
  // (execCommand fires no beforeinput here, so the mock flattens the blocks right after typing instead.)
  window.__pasting = false;
  if (slug === 'mocklostbreaks' || slug === 'mockpasteonly') new MutationObserver(()=>{ if (window.__pasting) return; if (tb.querySelector('div,br')) { tb.textContent=tb.textContent; const r=document.createRange(); r.selectNodeContents(tb); r.collapse(false); const sel=getSelection(); sel.removeAllRanges(); sel.addRange(r); } }).observe(tb,{childList:true,subtree:true,characterData:true});
  tb.addEventListener('paste', e => { e.preventDefault(); const t=e.clipboardData.getData('text/plain');
    if (slug === 'mocklostbreaks') { document.execCommand('insertText', false, t.replace(/\\n/g, '')); return; }
    window.__pasting = true;
    t.split('\\n').forEach((l,i)=>{ if (i>0) document.execCommand('insertParagraph'); if (l) document.execCommand('insertText', false, l); });
    setTimeout(()=>{ window.__pasting = false; }, 0); });
  const inp=document.getElementById('img');
  if (inp) inp.onchange=()=>{ const bar=document.createElement('div'); bar.setAttribute('role','progressbar'); d.appendChild(bar); const files=[...inp.files];
    setTimeout(()=>{ bar.remove(); files.forEach(f=>{ const im=document.createElement('img'); im.src=URL.createObjectURL(f); im.setAttribute('data-name', f.name); d.appendChild(im); }); }, 800); };
  // A link in the text makes the mock show a preview card with a close button, like Facebook does.
  tb.addEventListener('input',()=>{ if (/http/.test(tb.textContent)) setTimeout(()=>{ if (d.querySelector('#rmprev')) return;
    const b=document.createElement('div'); b.setAttribute('role','button'); b.setAttribute('aria-label','Remove preview'); b.id='rmprev'; b.onclick=()=>b.remove(); d.appendChild(b); }, 500); });
  document.getElementById('post').onclick=()=>{ window.__posted=(window.__posted||[]);
    const names=[...d.querySelectorAll('img')].map(i=>i.getAttribute('data-name')).join(',');
    fetch('/__posted?t='+encodeURIComponent(tb.textContent)+'&n='+d.querySelectorAll('img').length+'&p='+(d.querySelector('#rmprev')?1:0)+'&names='+encodeURIComponent(names)+'&i='+encodeURIComponent(tb.innerHTML.replace(/<div><br><\\/div>/g,'\\n').replace(/<div>/g,'\\n').replace(/<\\/div>/g,'').replace(/<br>/g,'\\n'))); d.remove();
    if (location.pathname.split('/')[2] === 'mockpending') { const n=document.createElement('div'); n.textContent='Your post is pending approval.'; document.body.appendChild(n); } };
};
</script></body></html>"""

ext, exe, prof = [os.path.realpath(a) for a in sys.argv[1:4]]
eid = ''.join(chr(97 + int(c, 16)) for c in hashlib.sha256(ext.encode()).hexdigest()[:32])
posted = []
posted_meta = []  # per post: number of images, whether the preview card was still open, image names
comments = []

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/__posted'):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            posted.append(q['t'][0])
            posted_meta.append({'n': int(q.get('n', ['0'])[0]), 'p': int(q.get('p', ['0'])[0]), 'names': q.get('names', [''])[0], 'i': q.get('i', [''])[0]})
            body, ctype = b'ok', 'text/plain'
        elif self.path.startswith('/__comment'):
            comments.append(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)['t'][0])
            body, ctype = b'ok', 'text/plain'
        else:
            body, ctype = MOCK.encode(), 'text/html; charset=utf-8'
        self.send_response(200); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass

tmp = tempfile.mkdtemp()
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',f'{tmp}/k.pem','-out',f'{tmp}/c.pem','-days','1','-subj','/CN=www.facebook.com'],check=True,capture_output=True)
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8443), H)
sslctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); sslctx.load_cert_chain(f'{tmp}/c.pem', f'{tmp}/k.pem')
srv.socket = sslctx.wrap_socket(srv.socket, server_side=True)
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(prof, executable_path=exe, headless=False,
        args=[f"--disable-extensions-except={ext}", f"--load-extension={ext}", "--no-sandbox",
              "--ignore-certificate-errors",
              "--host-resolver-rules=MAP www.facebook.com 127.0.0.1:8443, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"])
    pg = ctx.new_page(); errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("dialog", lambda d: d.accept())  # UI asks to confirm launching a run
    pg.goto(f"chrome-extension://{eid}/options.html#groups"); pg.wait_for_selector("text=Connecttech Auto Poster")
    pg.fill("#group-list", "https://www.facebook.com/groups/mock1 | Mock One\nhttps://www.facebook.com/groups/mock2 | Mock Two\nhttps://evil.example/groups/x")
    pg.click("button:has-text('Thêm nhóm')"); pg.wait_for_selector("text=Nhóm của bạn (2)")
    assert pg.locator("text=không phải liên kết nhóm Facebook").count() == 1, "reject notice missing"

    # A group added without a name gets its name read from the page; typed names are kept.
    pg.fill("#group-list", "https://www.facebook.com/groups/mock3")
    pg.click("button:has-text('Thêm nhóm')"); pg.wait_for_selector("text=Nhóm của bạn (3)")
    pg.click("button:has-text('Lấy tên nhóm')")
    pg.wait_for_selector("td:text-is('Mock Group Name')", timeout=60000)
    assert pg.locator("td:text-is('Mock One')").count() == 1, "typed name must not be overwritten"

    pg.click("button:has-text('Chiến dịch')")
    pg.click("button:has-text('Tạo mới')")
    pg.fill("#c-name", "Smoke")
    pg.fill("#c-var-0", "Hello A"); pg.click("button:has-text('Thêm phiên bản khác')"); pg.fill("#c-var-1", "Hello B")
    for lbl in ("Mock One", "Mock Two"): pg.check(f"label:has-text('{lbl}') input")
    pg.fill("#c-min", "30"); pg.fill("#c-max", "30")
    pg.uncheck("text=Nghỉ an toàn: tự động tạm dừng")
    pg.click("button:has-text('Lưu và chạy')"); pg.wait_for_selector("text=Đã bắt đầu chạy")

    pg.wait_for_selector("text=1/2 nhóm", timeout=90000)
    print("first post done; status:", pg.locator(".runbar__text").inner_text().replace("\n", " "))
    pg.wait_for_selector(".badge--done", timeout=120000)
    pg.click("button:has-text('Nhật ký')"); time.sleep(1)
    print(pg.locator("tbody").inner_text().replace("\t", " | "))
    print("posted texts:", posted, "| page errors:", errors)
    assert posted == ["Hello A", "Hello B"], posted
    assert not errors

    # Daily schedule: a second campaign scheduled for the next minute must start by itself.
    from datetime import datetime, timedelta
    when = datetime.now() + timedelta(minutes=1 if datetime.now().second < 40 else 2)
    pg.click("button:has-text('Chiến dịch')")
    pg.click("button:has-text('Tạo mới')")
    pg.fill("#c-name", "Smoke lịch"); pg.fill("#c-var-0", "Hello Schedule")
    pg.check("label:has-text('Mock One') input")
    pg.fill("#c-min", "30"); pg.fill("#c-max", "30")
    pg.check("text=Tự động chạy chiến dịch này mỗi ngày")
    pg.click("button:has-text('Thêm giờ')"); pg.fill("#c-time-0", when.strftime("%H:%M"))
    pg.wait_for_selector("text=Lần chạy tiếp theo")
    pg.click("button:has-text('Lưu chiến dịch')"); pg.wait_for_selector("text=Đã lưu.")
    # Two times closer than 6 hours must be refused and not saved.
    pg.click("button:has-text('Thêm giờ')"); pg.fill("#c-time-1", (when + timedelta(hours=2)).strftime("%H:%M"))
    pg.wait_for_selector("text=cách nhau ít nhất 6 giờ")
    pg.fill("#c-time-1", (when + timedelta(hours=7)).strftime("%H:%M"))
    assert pg.locator("button:has-text('Thêm giờ')").is_disabled(), "add-time button should be disabled at 2 times"
    pg.click("button[aria-label='Xóa giờ chạy 2']")
    deadline = time.time() + 150
    while len(posted) < 3 and time.time() < deadline: time.sleep(2)
    print("posted after schedule:", posted)
    assert posted[2:] == ["Hello Schedule"], posted
    pg.click("button:has-text('Nhật ký')"); time.sleep(1)
    assert "Đã bắt đầu chạy: 1 nhóm" in pg.locator("tbody").inner_text()
    pg.click("button:has-text('Chiến dịch')")
    pg.click("button:has-text('Tạo mới')")
    pg.fill('#c-name', 'Smoke bình luận')
    pg.select_option('#c-mode', 'comment')
    pg.fill('#c-comment-limit', '1')
    pg.fill('#c-var-0', 'Bình luận thử')
    pg.check("label:has-text('Mock One') input")
    pg.click("button:has-text('Lưu và chạy')")
    pg.wait_for_selector('text=Đã bắt đầu chiến dịch bình luận.')
    pg.wait_for_selector('.badge--done', timeout=90000)
    assert comments == ['Bình luận thử'], comments
    assert not errors

    def run_comment_campaign(name, group_label, newest=False):
        pg.click("button:has-text('Chiến dịch')")
        pg.click("button:has-text('Tạo mới')")
        pg.fill('#c-name', name)
        pg.select_option('#c-mode', 'comment')
        pg.fill('#c-comment-limit', '1')
        pg.fill('#c-var-0', 'Bình luận thử')
        pg.check(f"label:has-text('{group_label}') input")
        if newest: pg.check('text=Bình luận các bài mới nhất')
        pg.click("button:has-text('Lưu và chạy')")
        pg.wait_for_selector('text=Đã bắt đầu chiến dịch bình luận.')

    def wait_for_log(text):
        pg.click("button:has-text('Nhật ký')")
        try:
            pg.wait_for_selector(f"td:has-text('{text}')", timeout=90000)
        except Exception:
            print('LOG TABLE AT TIMEOUT:', pg.locator('tbody').inner_text().replace('\t', ' | ')[:1500])
            raise

    # Re-running against the same group must not comment on the same post twice.
    run_comment_campaign('Smoke bình luận lặp', 'Mock One')
    wait_for_log('tất cả đã được thử trước đó')
    assert comments == ['Bình luận thử'], f"post was commented twice: {comments}"

    # A group with no recent post is skipped with a reason, and nothing is sent.
    pg.click("button:text-is('Nhóm')")
    pg.fill('#group-list', 'https://www.facebook.com/groups/mockempty | Mock Empty')
    pg.click("button:has-text('Thêm nhóm')"); pg.wait_for_selector("td:text-is('Mock Empty')")
    run_comment_campaign('Smoke bình luận trống', 'Mock Empty')
    wait_for_log('Không xác định được bài phù hợp trong 24 giờ')
    assert comments == ['Bình luận thử'], f"comment sent without an eligible post: {comments}"
    assert not errors

    # Newest-posts mode: a feed post with no link, time or ID is commented once; a second run finds it already tried.
    pg.click("button:text-is('Nhóm')")
    pg.fill('#group-list', 'https://www.facebook.com/groups/mockfeed | Mock Feed')
    pg.click("button:has-text('Thêm nhóm')"); pg.wait_for_selector("td:text-is('Mock Feed')")
    run_comment_campaign('Smoke bình luận feed', 'Mock Feed', newest=True)
    deadline = time.time() + 90
    while len(comments) < 2 and time.time() < deadline: time.sleep(1)
    assert comments == ['Bình luận thử', 'Bình luận thử'], f"feed post was not commented: {comments}"
    run_comment_campaign('Smoke bình luận feed lặp', 'Mock Feed', newest=True)
    wait_for_log('Không có bài mới nào chưa thử trong feed')
    assert len(comments) == 2, f"feed post was commented twice: {comments}"
    assert not errors

    # A group where admins approve posts: the post is logged as pending, not as posted.
    pg.click("button:text-is('Nhóm')")
    pg.fill('#group-list', 'https://www.facebook.com/groups/mockpending | Mock Pending')
    pg.click("button:has-text('Thêm nhóm')"); pg.wait_for_selector("td:text-is('Mock Pending')")
    pg.click("button:has-text('Chiến dịch')")
    pg.click("button:has-text('Tạo mới')")
    pg.fill('#c-name', 'Smoke chờ duyệt'); pg.fill('#c-var-0', 'Hello Pending')
    pg.check("label:has-text('Mock Pending') input")
    pg.fill('#c-min', '30'); pg.fill('#c-max', '30')
    pg.click("button:has-text('Lưu và chạy')"); pg.wait_for_selector('text=Đã bắt đầu chạy')
    wait_for_log('đang chờ quản trị viên nhóm phê duyệt')
    assert posted[-1] == 'Hello Pending', posted

    # Stop a run after its first group, then continue: only the remaining group is posted.
    before = len(posted)
    pg.click("button:has-text('Chiến dịch')")
    pg.click("button:has-text('Tạo mới')")
    pg.fill('#c-name', 'Smoke tiếp tục'); pg.fill('#c-var-0', 'Hello Continue')
    for lbl in ('Mock One', 'Mock Two'): pg.check(f"label:has-text('{lbl}') input")
    pg.fill('#c-min', '30'); pg.fill('#c-max', '30')
    pg.click("button:has-text('Lưu và chạy')"); pg.wait_for_selector('text=Đã bắt đầu chạy')
    pg.wait_for_selector('text=1/2 nhóm', timeout=90000)
    pg.click("button:text-is('Dừng')")
    pg.wait_for_selector("button:has-text('Chạy tiếp 1 nhóm còn lại')")
    assert len(posted) == before + 1, posted
    pg.click("button:has-text('Chạy tiếp 1 nhóm còn lại')")
    pg.wait_for_selector('.badge--done', timeout=120000)
    assert posted[before:] == ['Hello Continue', 'Hello Continue'], posted
    wait_for_log('Chạy tiếp lượt đã dừng')

    # --- v0.5 content: {group} template, image attachments, link preview option (local mock only) ---
    import base64, zlib, struct
    def tiny_png(path, size):
        raw = b''.join(b'\x00' + b'\x30\x60\xa0' * size for _ in range(size))
        def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
        open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
    img_a, img_b = f"{tmp}/anh-a.png", f"{tmp}/anh-b.png"
    tiny_png(img_a, 40); tiny_png(img_b, 60)

    pg.click("button:text-is('Nhóm')")
    pg.fill('#group-list', 'https://www.facebook.com/groups/mocknoimg | Mock NoImg')
    pg.click("button:has-text('Thêm nhóm')"); pg.wait_for_selector("td:text-is('Mock NoImg')")

    def new_post_campaign(name, text, group_label):
        pg.click("button:has-text('Chiến dịch')")
        pg.click("button:has-text('Tạo mới')")
        pg.fill('#c-name', name); pg.fill('#c-var-0', text)
        pg.check(f"label:has-text('{group_label}') input")
        pg.fill('#c-min', '30'); pg.fill('#c-max', '30')

    # {group} is replaced with the stored group name; two images are attached and uploaded before Post.
    new_post_campaign('Smoke ảnh', 'Chào {group}!', 'Mock One')
    assert pg.locator("text=Dùng {group} để chèn tên nhóm.").count() >= 1, "placeholder hint missing"
    pg.set_input_files('#c-images', [img_a, img_b])
    pg.wait_for_selector("img[alt='Ảnh xem trước: anh-a.png']"); pg.wait_for_selector("img[alt='Ảnh xem trước: anh-b.png']")
    pg.click("button:has-text('Lưu và chạy')"); pg.wait_for_selector('text=Đã bắt đầu chạy')
    pg.wait_for_selector('.badge--done', timeout=120000)
    assert posted[-1] == 'Chào Mock One!', posted
    assert posted_meta[-1]['n'] == 2 and posted_meta[-1]['names'] == 'anh-a.png,anh-b.png', posted_meta[-1]

    # Unknown placeholders are warned about and posted as typed.
    new_post_campaign('Smoke mẫu lạ', 'Xin chào {foo}', 'Mock One')
    pg.wait_for_selector("text=không được hỗ trợ")
    pg.click("button:has-text('Lưu và chạy')"); pg.wait_for_selector('text=Đã bắt đầu chạy')
    pg.wait_for_selector('.badge--done', timeout=120000)
    assert posted[-1] == 'Xin chào {foo}', posted

    # A composer without an image input: the post fails and no text-only post is sent.
    count = len(posted)
    new_post_campaign('Smoke thiếu ô ảnh', 'Chỉ chữ nếu lỗi', 'Mock NoImg')
    pg.set_input_files('#c-images', [img_a])
    pg.wait_for_selector("img[alt='Ảnh xem trước: anh-a.png']")
    pg.click("button:has-text('Lưu và chạy')"); pg.wait_for_selector('text=Đã bắt đầu chạy')
    wait_for_log('Không tìm thấy ô nhận ảnh')
    pg.wait_for_selector('.badge--halted, .badge--done, .badge--paused', timeout=120000)
    assert len(posted) == count, f"a text-only post was sent although images were chosen: {posted}"

    # Link preview: with the option on the card is closed before Post; with it off the card stays.
    new_post_campaign('Smoke bỏ preview', 'Xem http://example.test/a', 'Mock One')
    pg.check("label:has-text('Bỏ xem trước link khi đăng') input")
    pg.click("button:has-text('Lưu và chạy')"); pg.wait_for_selector('text=Đã bắt đầu chạy')
    pg.wait_for_selector('.badge--done', timeout=120000)
    assert posted[-1] == 'Xem http://example.test/a' and posted_meta[-1]['p'] == 0, (posted[-1], posted_meta[-1])
    new_post_campaign('Smoke giữ preview', 'Xem http://example.test/b', 'Mock One')
    pg.click("button:has-text('Lưu và chạy')"); pg.wait_for_selector('text=Đã bắt đầu chạy')
    pg.wait_for_selector('.badge--done', timeout=120000)
    assert posted[-1] == 'Xem http://example.test/b' and posted_meta[-1]['p'] == 1, (posted[-1], posted_meta[-1])
    assert not errors

    # A long multi-line post with emoji, blank lines, a link and hashtags keeps its lines.
    long_post = (
        "NĂNG LỰC CỦA DOANH NGHIỆP CÓ ĐANG ĐƯỢC THỂ HIỆN XỨNG ĐÁNG TRÊN WEBSITE?🔍\n"
        "Gửi đường link website cho một khách hàng mới, phải nhắn thêm: “Bên mình còn làm nhiều hơn thế”?\n"
        "Doanh nghiệp đã có thêm dự án, đội ngũ lớn hơn.\n\n"
        "💬Thử mở lại website của mình, khách đã có đủ lý do để bắt đầu một cuộc trò chuyện chưa?\n"
        "-----------------\n"
        "Connect Tech - Web Design Agency\n"
        "📍 Địa chỉ: 965/36/9 Quang Trung, TP. Hồ Chí Minh\n"
        "🌐 Website: https://connecttech.vn\n"
        "☎️ Hotline: 077 317 5996\n"
        "#connecttech #thietkewebsite #webdesign"
    )
    new_post_campaign('Smoke bài nhiều dòng', long_post, 'Mock One')
    pg.click("button:has-text('Lưu và chạy')"); pg.wait_for_selector('text=Đã bắt đầu chạy')
    pg.wait_for_selector('.badge--done', timeout=120000)
    got = posted_meta[-1]['i'].replace('\r\n', '\n').strip()
    print('multi-line sent lines:', len(got.split('\n')), 'expected:', len(long_post.split('\n')))
    assert got == long_post, (got, long_post)
    assert not errors

    # An editor that loses line breaks: the post fails and nothing is sent as one block.
    pg.click("button:text-is('Nhóm')")
    pg.fill('#group-list', 'https://www.facebook.com/groups/mocklostbreaks | Mock LostBreaks')
    pg.click("button:has-text('Thêm nhóm')"); pg.wait_for_selector("td:text-is('Mock LostBreaks')")
    count = len(posted)
    new_post_campaign('Smoke mất xuống dòng', 'Dòng một\nDòng hai\n\nDòng ba', 'Mock LostBreaks')
    pg.click("button:has-text('Lưu và chạy')"); pg.wait_for_selector('text=Đã bắt đầu chạy')
    wait_for_log('không giữ được xuống dòng')
    pg.wait_for_selector('.badge--halted, .badge--done, .badge--paused', timeout=120000)
    assert len(posted) == count, f"a post with lost line breaks was sent: {posted[count:]}"
    assert not errors

    # An editor that keeps lines only for a paste: the post goes out once, with its lines, and is not entered twice.
    pg.click("button:text-is('Nhóm')")
    pg.fill('#group-list', 'https://www.facebook.com/groups/mockpasteonly | Mock PasteOnly')
    pg.click("button:has-text('Thêm nhóm')"); pg.wait_for_selector("td:text-is('Mock PasteOnly')")
    count = len(posted)
    short_post = 'Dòng một dài đủ để kiểm tra\nDòng hai\n\nDòng ba'
    new_post_campaign('Smoke chỉ dán', short_post, 'Mock PasteOnly')
    pg.click("button:has-text('Lưu và chạy')"); pg.wait_for_selector('text=Đã bắt đầu chạy')
    pg.wait_for_selector('.badge--done', timeout=120000)
    assert len(posted) == count + 1, posted[count:]
    assert posted_meta[-1]['i'].strip() == short_post, posted_meta[-1]['i']
    assert not errors

    # Overview: today's numbers are filled in and the notification option can be switched on.
    pg.click("button:text-is('Tổng quan')")
    pg.wait_for_selector('text=Tỉ lệ thành công')
    assert pg.locator('.overview__stat-value').first.inner_text() != '0', "today's sent count should not be 0"
    pg.check("label:has-text('Thông báo trên máy') input")
    assert not errors
    # Backup: export, wipe the local data, import the file, and check the counts. Schedules come back switched off.
    keys = "['groups','campaigns','logs']"
    before = pg.evaluate(f"chrome.storage.local.get({keys}).then(d => ({{groups: d.groups.length, campaigns: d.campaigns.length, logs: d.logs.length, images: d.campaigns.reduce((n, c) => n + (c.images ? c.images.length : 0), 0), preview: d.campaigns.filter(c => c.removeLinkPreview).length, scheduled: d.campaigns.filter(c => c.schedule && c.schedule.enabled).length}}))")
    assert before['scheduled'] >= 1 and before['images'] == 3 and before['preview'] == 1, before
    pg.click("button:text-is('Sao lưu')")
    with pg.expect_download() as download:
        pg.click("button:text-is('Xuất bản sao lưu')")
    backup_path = f"{tmp}/backup.json"
    download.value.save_as(backup_path)
    assert download.value.suggested_filename.startswith('cap-backup-'), download.value.suggested_filename
    pg.evaluate("chrome.storage.local.clear()")
    pg.reload(); pg.click("button:text-is('Sao lưu')")
    pg.set_input_files('#backup-file', backup_path)
    pg.wait_for_selector("text=Xem trước:")
    assert "Lịch sẽ được tắt khi nhập" in pg.locator('.backup__preview').inner_text()
    pg.click("button:text-is('Nhập dữ liệu')")
    pg.wait_for_selector("text=Đã nhập")
    after = pg.evaluate(f"chrome.storage.local.get({keys}).then(d => ({{groups: d.groups.length, campaigns: d.campaigns.length, logs: d.logs.length, images: d.campaigns.reduce((n, c) => n + (c.images ? c.images.length : 0), 0), preview: d.campaigns.filter(c => c.removeLinkPreview).length, scheduled: d.campaigns.filter(c => c.schedule && c.schedule.enabled).length}}))")
    assert after['images'] == before['images'] and after['preview'] == before['preview'], (before, after)
    assert after['groups'] == before['groups'] and after['campaigns'] == before['campaigns'], (before, after)
    assert after['logs'] >= before['logs'] and after['scheduled'] == 0, (before, after)
    # Importing the same file again adds nothing.
    pg.reload(); pg.click("button:text-is('Sao lưu')")
    pg.set_input_files('#backup-file', backup_path)
    pg.wait_for_selector("text=Xem trước:")
    pg.click("button:text-is('Nhập dữ liệu')")
    pg.wait_for_selector("text=Đã nhập 0 nhóm, 0 chiến dịch, 0 dòng nhật ký")
    assert not errors
    print("SMOKE OK")
    ctx.close()
