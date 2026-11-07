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
  article.innerHTML='<time id="published"></time><a id="post-link">Bài viết</a><div role="textbox" contenteditable="true" aria-label="Write a comment" id="comment"></div><button aria-label="Post comment" id="send-comment">Gửi</button>';
  document.body.appendChild(article);
  document.getElementById('published').setAttribute('datetime', new Date().toISOString());
  document.getElementById('post-link').href = '/groups/' + location.pathname.split('/')[2] + '/posts/123/';
  document.getElementById('send-comment').onclick=()=>{ const el=document.getElementById('comment'); fetch('/__comment?t='+encodeURIComponent(el.textContent)); const result=document.createElement('div'); result.dir='auto'; result.textContent=el.textContent; article.appendChild(result); el.textContent=''; };
}, 2000);
document.getElementById('open').onclick=()=>{
  const d=document.createElement('div'); d.setAttribute('role','dialog');
  d.innerHTML='<div role="textbox" contenteditable="true" id="tb"></div><div role="button" aria-label="Post" id="post">Post</div>';
  document.body.appendChild(d);
  document.getElementById('post').onclick=()=>{ window.__posted=(window.__posted||[]); fetch('/__posted?t='+encodeURIComponent(document.getElementById('tb').textContent)); d.remove();
    if (location.pathname.split('/')[2] === 'mockpending') { const n=document.createElement('div'); n.textContent='Your post is pending approval.'; document.body.appendChild(n); } };
};
</script></body></html>"""

ext, exe, prof = [os.path.realpath(a) for a in sys.argv[1:4]]
eid = ''.join(chr(97 + int(c, 16)) for c in hashlib.sha256(ext.encode()).hexdigest()[:32])
posted = []
comments = []

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/__posted'):
            posted.append(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)['t'][0])
            body, ctype = b'ok', 'text/plain'
        elif self.path.startswith('/__comment'):
            comments.append(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)['t'][0])
            body, ctype = b'ok', 'text/plain'
        else:
            body, ctype = MOCK.encode(), 'text/html'
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

    def run_comment_campaign(name, group_label):
        pg.click("button:has-text('Chiến dịch')")
        pg.click("button:has-text('Tạo mới')")
        pg.fill('#c-name', name)
        pg.select_option('#c-mode', 'comment')
        pg.fill('#c-comment-limit', '1')
        pg.fill('#c-var-0', 'Bình luận thử')
        pg.check(f"label:has-text('{group_label}') input")
        pg.click("button:has-text('Lưu và chạy')")
        pg.wait_for_selector('text=Đã bắt đầu chiến dịch bình luận.')

    def wait_for_log(text):
        pg.click("button:has-text('Nhật ký')")
        pg.wait_for_selector(f"td:has-text('{text}')", timeout=90000)

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

    # Overview: today's numbers are filled in and the notification option can be switched on.
    pg.click("button:text-is('Tổng quan')")
    pg.wait_for_selector('text=Tỉ lệ thành công')
    assert pg.locator('.overview__stat-value').first.inner_text() != '0', "today's sent count should not be 0"
    pg.check("label:has-text('Thông báo trên máy') input")
    assert not errors
    print("SMOKE OK")
    ctx.close()
