"""Smoke test: loads the built extension in Chromium and runs a full campaign
against a LOCAL MOCK of a Facebook group page. DNS is remapped so *.facebook.com
resolves to 127.0.0.1 and every other host fails: no real network traffic.
Usage: python3 e2e/smoke.py <ext_dir> <chromium_exe> <profile_dir>"""
import hashlib, http.server, json, os, ssl, subprocess, sys, tempfile, threading, time, urllib.parse
from playwright.sync_api import sync_playwright

MOCK = """<!doctype html><html><head><title>(2) Mock Group Name | Facebook</title></head><body><h1>Mock group</h1>
<div role="button" id="open">Write something...</div>
<script>
// "Groups you joined" page: pending requests first, then the joined list, which grows when scrolled to the end.
if (location.pathname.startsWith('/groups/joins')) {
  document.title = 'Facebook';
  document.body.innerHTML = '<div role="navigation"><a href="/groups/feed/">Bảng feed</a></div><div role="main"><div>' +
    '<div><div><h2>Yêu cầu tham gia nhóm đang chờ (1)</h2><a href="/groups/mockpendingx/">Pending X</a></div></div>' +
    '<div><div><h2>Tất cả các nhóm bạn đã tham gia (3)</h2><div id="joined"></div></div></div></div></div>';
  const list = document.getElementById('joined');
  const row = (slug, name) => { const d = document.createElement('div'); d.style.minHeight = '700px';
    d.innerHTML = '<a href="/groups/' + slug + '/">' + name + '</a><a href="/groups/' + slug + '/" aria-label="Xem nhóm">Xem nhóm</a>'; list.appendChild(d); };
  const later = [['mockjoined1', 'Nhóm A'], ['mockjoined2', 'Nhóm B']];
  row('mock1', 'Mock One trên Facebook');
  let loading = false;
  addEventListener('scroll', () => {
    if (loading || !later.length || scrollY + innerHeight < document.documentElement.scrollHeight - 200) return;
    loading = true; setTimeout(() => { row(...later.shift()); loading = false; }, 500);
  });
} else {
setTimeout(()=>{
  // Group feed, like Facebook's: items are plain children of [role=feed]; each has its own comment form.
  const slug = location.pathname.split('/')[2];
  const feed = document.createElement('div'); feed.setAttribute('role', 'feed'); document.body.appendChild(feed);
  const header = p => '<h3><a href="/groups/' + slug + '/user/1/">' + p.author + '</a></h3>' +
    (p.hoverTime ? '<span role="link" class="ts">Facebook</span>' : p.age ? (p.link ? '<a href="/groups/' + slug + '/posts/' + p.link + '/">' + p.age + '</a>' : '<span>' + p.age + '</span>') : '');
  const fill = (el, p) => {
    el.innerHTML = header(p) + '<div dir="auto">' + p.body + '</div><div role="button" aria-label="Bình luận về bài viết của ' + p.author + '">Bình luận</div>' +
      (p.mine ? '<div role="article" aria-label="Bình luận dưới tên Tôi"><a href="/u">Tôi</a><div dir="auto">hay quá</div></div>' : '') +
      '<form><div role="textbox" contenteditable="true" aria-label="Bình luận dưới tên Tôi"></div><button type="button" aria-label="Post comment">Gửi</button></form>';
    const ts = el.querySelector('.ts');
    // The post time and link appear only while the pointer is over the time label.
    if (ts) ts.addEventListener('mouseover', () => { ts.outerHTML = '<a href="/groups/' + slug + '/posts/' + p.link + '/">' + p.hoverTime + '</a>'; });
    el.querySelector('button[aria-label="Post comment"]').onclick = () => {
      const box = el.querySelector('[contenteditable]'); const text = box.textContent;
      fetch('/__comment?t=' + encodeURIComponent(text) + '&a=' + encodeURIComponent(p.author));
      const result = document.createElement('div'); result.dir = 'auto'; result.textContent = text; el.appendChild(result); box.textContent = '';
    };
  };
  const add = p => {
    const el = document.createElement('div'); el.style.minHeight = (slug === 'mockscroll' ? 900 : 100) + 'px'; feed.appendChild(el);
    if (!p.lazy) return fill(el, p);
    // Placeholder until it is near the viewport, like Facebook's virtualised feed.
    const check = () => { const r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0 && !el.children.length) fill(el, p); };
    addEventListener('scroll', check); check();
  };
  const sets = {
    mockempty: [{ author: 'Cũ', body: 'Bài cũ', age: '3 ngày', link: 9 }],
    mockfeed: [{ author: 'Lan', body: 'Bài không có liên kết' }],
    mockscroll: [
      { author: 'An', body: 'Bài đã bình luận', age: '2 phút', mine: true },
      { author: 'Bình', body: 'Bài thứ hai', age: '10 phút', lazy: true },
    ],
  };
  // Loaded only when the page is scrolled to the end, one at a time (infinite scroll).
  const later = slug === 'mockscroll' ? [
    { author: 'Chi', body: 'Bài thứ ba', hoverTime: '40 phút', link: 777 },
    { author: 'Dũng', body: 'Bài cũ một', age: '2 ngày' },
    { author: 'Em', body: 'Bài cũ hai', age: '3 ngày' },
    { author: 'Giang', body: 'Bài cũ ba', age: '4 ngày' },
  ] : [];
  (sets[slug] || [{ author: 'Lan', body: 'Bài viết', age: '5 phút', link: 123 }]).forEach(add);
  let loading = false;
  addEventListener('scroll', () => {
    if (loading || !later.length || scrollY + innerHeight < document.documentElement.scrollHeight - 200) return;
    loading = true; setTimeout(() => { add(later.shift()); loading = false; }, 500);
  });
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
}
</script></body></html>"""

ext, exe, prof = [os.path.realpath(a) for a in sys.argv[1:4]]
eid = ''.join(chr(97 + int(c, 16)) for c in hashlib.sha256(ext.encode()).hexdigest()[:32])
posted = []
posted_meta = []  # per post: number of images, whether the preview card was still open, image names
comments = []
comment_authors = []
page_loads = []
github_requests = []  # update checks: api.github.com is mapped to this mock as well
LATEST_RELEASE = json.dumps({
    'tag_name': 'v99.0.0', 'draft': False, 'prerelease': False, 'published_at': '2026-11-11T00:00:00Z',
    'html_url': 'https://github.com/quyenlei/ConnecttechAutoPoster-releases/releases/tag/v99.0.0',
    'assets': [{'name': 'connecttech-auto-poster-99.0.0-chrome.zip', 'browser_download_url': 'https://github.com/quyenlei/ConnecttechAutoPoster-releases/releases/download/v99.0.0/cap.zip'}],
}).encode()

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/__posted'):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            posted.append(q['t'][0])
            posted_meta.append({'n': int(q.get('n', ['0'])[0]), 'p': int(q.get('p', ['0'])[0]), 'names': q.get('names', [''])[0], 'i': q.get('i', [''])[0]})
            body, ctype = b'ok', 'text/plain'
        elif self.headers.get('Host', '').startswith('api.github.com'):
            github_requests.append(self.path)
            ok = self.path == '/repos/quyenlei/ConnecttechAutoPoster-releases/releases/latest'
            body = LATEST_RELEASE if ok else b'{}'
            self.send_response(200 if ok else 404); self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
            return
        elif self.path.startswith('/__comment'):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            comments.append(q['t'][0]); comment_authors.append(q.get('a', [''])[0])
            body, ctype = b'ok', 'text/plain'
        else:
            page_loads.append(urllib.parse.urlparse(self.path).path)
            body, ctype = MOCK.encode(), 'text/html; charset=utf-8'
        self.send_response(200); self.send_header('Content-Type', ctype); self.send_header('Content-Security-Policy', "frame-src 'self'"); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass

tmp = tempfile.mkdtemp()
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',f'{tmp}/k.pem','-out',f'{tmp}/c.pem','-days','1','-subj','/CN=www.facebook.com'],check=True,capture_output=True)
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8443), H)
sslctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); sslctx.load_cert_chain(f'{tmp}/c.pem', f'{tmp}/k.pem')
srv.socket = sslctx.wrap_socket(srv.socket, server_side=True)
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    # Headless by default (new headless mode loads extensions and renders pages); E2E_HEADED=1 shows the browser.
    ctx = p.chromium.launch_persistent_context(prof, executable_path=exe, headless=os.environ.get('E2E_HEADED') != '1',
        args=[f"--disable-extensions-except={ext}", f"--load-extension={ext}", "--no-sandbox",
              "--ignore-certificate-errors",
              "--host-resolver-rules=MAP www.facebook.com 127.0.0.1:8443, MAP api.github.com 127.0.0.1:8443, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"])
    # Test only: skip every wait between runs steps (post/comment delay, group break, Safety Break, retry) so the
    # suite does not sit through them. It runs in the test's extension pages, not in the extension: as soon as a
    # step is scheduled, it moves the stored run's `nextAt` to now and re-creates the alarm. Unpacked extensions may
    # use alarms shorter than 30 s. Set `window.__capSkipWaits = false` on the page for a step that needs real waits.
    ctx.add_init_script("""
      if (location.protocol === 'chrome-extension:' && window.top === window) {
        window.__capSkipWaits = true;
        setInterval(async () => {
          if (!window.__capSkipWaits) return;
          const { run } = await chrome.storage.local.get('run');
          if (!run || run.status !== 'running' || run.nextAt == null || run.nextAt - Date.now() < 1000) return;
          const now = Date.now();
          await chrome.storage.local.set({ run: { ...run, nextAt: now } });
          await chrome.alarms.create('cap-next-post', { when: now + 100 });
        }, 500);
      }
    """)
    # Test only: answer CAP's own confirmation dialog (ui/confirm.tsx) with "yes", in every extension frame,
    # including the chat box framed in Facebook pages. Native browser dialogs must not appear at all.
    ctx.add_init_script("""
      if (location.protocol === 'chrome-extension:') {
        new MutationObserver(() => {
          const ok = document.querySelector('dialog.confirm[open] button[type=submit]');
          if (ok) ok.click();
        }).observe(document, { subtree: true, childList: true, attributes: true });
      }
    """)
    native_dialogs = []
    pg = ctx.new_page(); errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("dialog", lambda d: (native_dialogs.append(d.message), d.accept()))  # must stay empty: CAP uses its own dialog
    pg.goto(f"chrome-extension://{eid}/options.html#groups"); pg.wait_for_selector("text=Connecttech Auto Poster")
    # The automatic update check at start-up read the (mock) GitHub release: the dashboard offers the newer version.
    pg.wait_for_selector("text=Có bản mới", timeout=15000)
    pg.fill("#group-list", "https://www.facebook.com/groups/mock1 | Mock One\nhttps://www.facebook.com/groups/mock2 | Mock Two\nhttps://evil.example/groups/x")
    pg.click("button:has-text('Thêm nhóm')"); pg.wait_for_selector("text=Nhóm của bạn (2)")
    assert pg.locator("text=không phải liên kết nhóm Facebook").count() == 1, "reject notice missing"

    # A group added without a name gets its name read from the page; typed names are kept.
    pg.fill("#group-list", "https://www.facebook.com/groups/mock3")
    pg.click("button:has-text('Thêm nhóm')"); pg.wait_for_selector("text=Nhóm của bạn (3)")
    pg.click("button:has-text('Lấy tên nhóm')")
    pg.wait_for_selector("td:text-is('Mock Group Name')", timeout=60000)
    assert pg.locator("td:text-is('Mock One')").count() == 1, "typed name must not be overwritten"

    # The two ready-made campaigns: created on first install (no groups yet then), with empty text, so they
    # cannot run yet. The button adds only missing ones: none now; after deleting one, that one again, on the 3 groups.
    pg.click("button:has-text('Chiến dịch')")
    pg.wait_for_selector(".campaigns__list-title:text-is('Bình luận nhanh')"); pg.wait_for_selector(".campaigns__list-title:text-is('Đăng bài vào nhóm')")
    pg.click("button:has-text('Tạo chiến dịch mặc định')")
    pg.wait_for_selector("text=Hai chiến dịch mặc định đã có sẵn")
    pg.evaluate("chrome.storage.local.get('campaigns').then(d => chrome.storage.local.set({ campaigns: d.campaigns.filter(c => c.id !== 'default-comment') }))")
    pg.wait_for_selector(".campaigns__list-title:text-is('Bình luận nhanh')", state='detached')
    pg.click("button:has-text('Tạo chiến dịch mặc định')")
    pg.wait_for_selector("text=Đã tạo 1 chiến dịch mặc định trên 3 nhóm")
    assert pg.locator("#c-name").input_value() == 'Bình luận nhanh'
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

    def run_comment_campaign(name, group_label, newest=False, limit=1, text='Bình luận thử'):
        pg.click("button:has-text('Chiến dịch')")
        pg.click("button:has-text('Tạo mới')")
        pg.fill('#c-name', name)
        pg.select_option('#c-mode', 'comment')
        pg.fill('#c-comment-limit', str(limit))
        pg.fill('#c-var-0', text)
        pg.check(f"label:has-text('{group_label}') input")
        pg.fill('#c-min', '30'); pg.fill('#c-max', '30')
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
    wait_for_log('1 đã thử trước đó')
    assert comments == ['Bình luận thử'], f"post was commented twice: {comments}"

    # A group with no recent post is skipped with a reason, and nothing is sent.
    pg.click("button.shell__tab:has(span:text-is('Nhóm'))")
    pg.fill('#group-list', 'https://www.facebook.com/groups/mockempty | Mock Empty')
    pg.click("button:has-text('Thêm nhóm')"); pg.wait_for_selector("td:text-is('Mock Empty')")
    run_comment_campaign('Smoke bình luận trống', 'Mock Empty')
    wait_for_log('1 cũ hơn 24 giờ')
    assert comments == ['Bình luận thử'], f"comment sent without an eligible post: {comments}"
    assert not errors

    # Newest-posts mode: a feed post with no link, time or ID is commented once; a second run finds it already tried.
    pg.click("button.shell__tab:has(span:text-is('Nhóm'))")
    pg.fill('#group-list', 'https://www.facebook.com/groups/mockfeed | Mock Feed')
    pg.click("button:has-text('Thêm nhóm')"); pg.wait_for_selector("td:text-is('Mock Feed')")
    run_comment_campaign('Smoke bình luận feed', 'Mock Feed', newest=True)
    deadline = time.time() + 90
    while len(comments) < 2 and time.time() < deadline: time.sleep(1)
    assert comments == ['Bình luận thử', 'Bình luận thử'], f"feed post was not commented: {comments}"
    run_comment_campaign('Smoke bình luận feed lặp', 'Mock Feed', newest=True)
    wait_for_log('Đã xem 1 bài: 1 đã thử trước đó')
    assert len(comments) == 2, f"feed post was commented twice: {comments}"
    assert not errors

    # Infinite feed: the first post already has the user's comment, the second renders only near the viewport,
    # the third loads after scrolling to the end and shows its time only under the pointer, then old posts follow.
    # Two comments go to the second and third post, in one window that loads the group once.
    pg.click("button.shell__tab:has(span:text-is('Nhóm'))")
    pg.fill('#group-list', 'https://www.facebook.com/groups/mockscroll | Mock Scroll')
    pg.click("button:has-text('Thêm nhóm')"); pg.wait_for_selector("td:text-is('Mock Scroll')")
    loads_before = page_loads.count('/groups/mockscroll/')
    run_comment_campaign('Smoke bình luận cuộn', 'Mock Scroll', limit=2, text='Bình luận cuộn')
    deadline = time.time() + 150
    while comments.count('Bình luận cuộn') < 2 and time.time() < deadline: time.sleep(1)
    print('scroll comments:', comment_authors[-2:], '| loads:', page_loads.count('/groups/mockscroll/') - loads_before)
    if comment_authors[-2:] != ['Bình', 'Chi']:
        pg.click("button.shell__tab:has(span:text-is('Nhật ký'))"); print('\n'.join(pg.locator('tbody tr').all_inner_texts()[:8]))
    assert comment_authors[-2:] == ['Bình', 'Chi'], f"wrong posts commented: {comment_authors}"
    pg.wait_for_selector('.badge--done', timeout=60000)
    assert page_loads.count('/groups/mockscroll/') - loads_before == 1, f"group feed was loaded {page_loads.count('/groups/mockscroll/') - loads_before} times"
    assert not errors

    # A group where admins approve posts: the post is logged as pending, not as posted.
    pg.click("button.shell__tab:has(span:text-is('Nhóm'))")
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
    pg.evaluate('window.__capSkipWaits = false')  # Stop must be pressed during the real 30 s wait between the groups
    for lbl in ('Mock One', 'Mock Two'): pg.check(f"label:has-text('{lbl}') input")
    pg.fill('#c-min', '30'); pg.fill('#c-max', '30')
    pg.click("button:has-text('Lưu và chạy')"); pg.wait_for_selector('text=Đã bắt đầu chạy')
    pg.wait_for_selector('text=1/2 nhóm', timeout=90000)
    pg.click("button:text-is('Dừng')")
    pg.wait_for_selector("button:has-text('Chạy tiếp 1 nhóm còn lại')")
    assert len(posted) == before + 1, posted
    pg.click("button:has-text('Chạy tiếp 1 nhóm còn lại')")
    pg.evaluate('window.__capSkipWaits = true')
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

    pg.click("button.shell__tab:has(span:text-is('Nhóm'))")
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
    pg.click("button.shell__tab:has(span:text-is('Nhóm'))")
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
    pg.click("button.shell__tab:has(span:text-is('Nhóm'))")
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

    # Joined groups: the list is read from the mock "groups you joined" page (scrolled to load all), pending
    # requests are left out, the group already listed is marked, and only the ticked group is added.
    pg.click("button.shell__tab:has(span:text-is('Nhóm'))")
    pg.click("button:has-text('Lấy danh sách nhóm đã tham gia')")
    pg.wait_for_selector('text=Tìm thấy 3 nhóm', timeout=90000)
    assert pg.locator('text=2 nhóm chưa có trong danh sách').count() == 1, 'joined preview count'
    assert pg.locator("td:text-is('Pending X')").count() == 0, 'a pending join request was listed'
    pg.check("input[aria-label='Chọn Nhóm B']")
    pg.click("button:has-text('Thêm 1 nhóm đã chọn')")
    pg.wait_for_selector('text=Đã thêm 1 nhóm.')
    assert pg.locator("td:text-is('Nhóm B')").count() == 2, 'Nhóm B should be in the preview and in the group list'
    assert pg.locator("td:text-is('Nhóm A')").count() == 1, 'Nhóm A was added without being ticked'
    assert not errors

    # Overview: today's numbers are filled in and the notification option can be switched on.
    pg.click("button.shell__tab:has(span:text-is('Tổng quan'))")
    pg.wait_for_selector('text=Tỉ lệ thành công')
    assert pg.locator('.overview__stat-value').first.inner_text() != '0', "today's sent count should not be 0"
    # The checkbox is controlled by stored settings: it re-renders shortly after the storage write, so wait for that.
    box = "label:has-text('Thông báo trên máy') input"
    pg.click(box)
    pg.wait_for_function("() => chrome.storage.local.get('settings').then(d => d.settings && d.settings.notifyOnFinish === true)", timeout=10000)
    pg.wait_for_selector(box + ':checked', timeout=10000)
    assert not errors
    # Backup: export, wipe the local data, import the file, and check the counts. Schedules come back switched off.
    keys = "['groups','campaigns','logs']"
    before = pg.evaluate(f"chrome.storage.local.get({keys}).then(d => ({{groups: d.groups.length, campaigns: d.campaigns.length, logs: d.logs.length, images: d.campaigns.reduce((n, c) => n + (c.images ? c.images.length : 0), 0), preview: d.campaigns.filter(c => c.removeLinkPreview).length, scheduled: d.campaigns.filter(c => c.schedule && c.schedule.enabled).length}}))")
    assert before['scheduled'] >= 1 and before['images'] == 3 and before['preview'] == 1, before
    pg.click("button.shell__tab:has(span:text-is('Sao lưu'))")
    with pg.expect_download() as download:
        pg.click("button:text-is('Xuất bản sao lưu')")
    backup_path = f"{tmp}/backup.json"
    download.value.save_as(backup_path)
    assert download.value.suggested_filename.startswith('cap-backup-'), download.value.suggested_filename
    pg.evaluate("chrome.storage.local.clear()")
    pg.reload(); pg.click("button.shell__tab:has(span:text-is('Sao lưu'))")
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
    pg.reload(); pg.click("button.shell__tab:has(span:text-is('Sao lưu'))")
    pg.set_input_files('#backup-file', backup_path)
    pg.wait_for_selector("text=Xem trước:")
    pg.click("button:text-is('Nhập dữ liệu')")
    pg.wait_for_selector("text=Đã nhập 0 nhóm, 0 chiến dịch, 0 dòng nhật ký")
    # The chat box on a Facebook page (not only group pages): a round button opens a small window with the run
    # status, recent activity and a start button; it expands to the full dashboard in place, minimises and closes.
    # The mock sends a frame-src CSP like Facebook does; the extension pages must still load in the window.
    # The backup test above cleared storage; "Kiểm tra cập nhật" (tab Sao lưu) checks again at once.
    pg.click("button.shell__tab:has(span:text-is('Sao lưu'))"); pg.click("button:has-text('Kiểm tra cập nhật')")
    pg.wait_for_selector("text=Có bản mới", timeout=15000)
    fb = ctx.new_page(); fb.set_viewport_size({'width': 1440, 'height': 900}); fb.on('dialog', lambda d: (native_dialogs.append(d.message), d.accept())); fb.goto('https://www.facebook.com/')
    fb.click('cap-chat-host .cap-chat__launcher')
    chat = fb.frame_locator('cap-chat-host iframe')
    chat.locator("button:text-is('Chạy')").wait_for(timeout=15000)
    assert chat.locator('.chatbox__message').count() > 0, 'activity feed is empty'
    # The daily update check read the (mock) GitHub release, so the chat box offers the newer version.
    chat.locator("text=Có bản mới").wait_for(timeout=15000)
    assert chat.locator("a:has-text('Tải bản 99.0.0')").get_attribute('href').startswith('https://github.com/'), 'zip link must point to github.com'
    assert len(github_requests) >= 2 and set(github_requests) == {'/repos/quyenlei/ConnecttechAutoPoster-releases/releases/latest'}, github_requests
    fb.screenshot(path=os.path.join(prof, 'e2e-chatbox.png'))  # inside the throwaway profile, for a manual look
    fb.click("cap-chat-host button[aria-label='Mở rộng']")
    chat.locator("button.shell__tab:has(span:text-is('Chiến dịch'))").wait_for(timeout=15000)
    fb.click("cap-chat-host button[aria-label='Thu gọn']")
    chat.locator("button:text-is('Chạy')").wait_for(timeout=15000)
    fb.click("cap-chat-host button[aria-label='Thu nhỏ']")
    assert not fb.locator('cap-chat-host iframe').is_visible(), 'minimised window must hide its content'
    fb.click("cap-chat-host button[aria-label='Mở lại Auto Poster']")
    chat.locator("button:text-is('Chạy')").wait_for(timeout=15000)
    # Started from the chat box, a run uses this very tab: it moves from group to group and no tab is opened.
    opened = []
    ctx.on('page', lambda page: opened.append(page))
    before = len(posted)
    chat.locator('#chatbox-campaign').select_option(label='Smoke (đăng bài)')
    chat.locator("button:text-is('Chạy')").click()
    chat.locator('.badge--running, .chatbox__error').first.wait_for(timeout=15000)
    assert chat.locator('.chatbox__error').count() == 0, chat.locator('.chatbox__error').inner_text()
    deadline = time.time() + 120
    while len(posted) < before + 2 and time.time() < deadline: time.sleep(1)
    assert posted[before:] == ['Hello A', 'Hello B'], posted[before:]
    assert not opened, f"a run started from the chat box opened {len(opened)} tab(s)"
    try:
        fb.wait_for_url('**/groups/mock2/**', timeout=10000)
    except Exception:
        print('chat run tab url:', fb.url, '| pages:', [p.url for p in ctx.pages])
        raise
    fb.locator('cap-chat-host .cap-chat__window').wait_for()  # the chat box is back after each page load
    chat.locator('.badge--done').wait_for(timeout=60000)
    assert not fb.is_closed(), 'the user\'s tab must stay open after the run'
    fb.click("cap-chat-host button[aria-label='Đóng']")
    assert fb.locator('cap-chat-host .cap-chat__launcher').is_visible(), 'launcher must come back after closing'
    fb.close()
    assert not native_dialogs, f"native browser dialogs were used: {native_dialogs}"
    assert not errors

    # Last, because it closes every extension page: reloading the extension cuts off the chat box already on an
    # open Facebook page ("Extension context invalidated"). It must turn into a reload note instead of throwing.
    stale = ctx.new_page(); stale_errors = []
    stale.on('pageerror', lambda e: stale_errors.append(str(e)))
    stale.goto('https://www.facebook.com/'); stale.locator('cap-chat-host .cap-chat__launcher').wait_for()
    try:
        pg.evaluate('chrome.runtime.reload()')
    except Exception:
        pass  # the page closes as the extension reloads
    stale.locator('cap-chat-host .cap-chat__stale').wait_for(timeout=15000)
    assert 'Tải lại trang' in stale.locator('cap-chat-host .cap-chat__stale').inner_text()
    assert not stale_errors, stale_errors
    # Under test automation the reloaded unpacked extension does not come back, so the new version is not checked here.
    print("SMOKE OK")
    ctx.close()
