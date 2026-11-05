"""Smoke test: loads the built extension in Chromium and runs a full campaign
against a LOCAL MOCK of a Facebook group page. DNS is remapped so *.facebook.com
resolves to 127.0.0.1 and every other host fails: no real network traffic.
Usage: python3 e2e/smoke.py <ext_dir> <chromium_exe> <profile_dir>"""
import hashlib, http.server, os, ssl, subprocess, sys, tempfile, threading, time, urllib.parse
from playwright.sync_api import sync_playwright

MOCK = """<!doctype html><html><body><h1>Mock group</h1>
<div role="button" id="open">Write something...</div>
<script>
document.getElementById('open').onclick=()=>{
  const d=document.createElement('div'); d.setAttribute('role','dialog');
  d.innerHTML='<div role="textbox" contenteditable="true" id="tb"></div><div role="button" aria-label="Post" id="post">Post</div>';
  document.body.appendChild(d);
  document.getElementById('post').onclick=()=>{ window.__posted=(window.__posted||[]); fetch('/__posted?t='+encodeURIComponent(document.getElementById('tb').textContent)); d.remove(); };
};
</script></body></html>"""

ext, exe, prof = [os.path.realpath(a) for a in sys.argv[1:4]]
eid = ''.join(chr(97 + int(c, 16)) for c in hashlib.sha256(ext.encode()).hexdigest()[:32])
posted = []

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/__posted'):
            posted.append(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)['t'][0])
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
    pg.goto(f"chrome-extension://{eid}/options.html#groups"); pg.wait_for_selector("text=Connecttech Auto Poster")
    pg.fill("#group-list", "https://www.facebook.com/groups/mock1 | Mock One\nhttps://www.facebook.com/groups/mock2 | Mock Two\nhttps://evil.example/groups/x")
    pg.click("button:has-text('Thêm nhóm')"); pg.wait_for_selector("text=Nhóm của bạn (2)")
    assert pg.locator("text=không phải liên kết nhóm Facebook").count() == 1, "reject notice missing"

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
    print("SMOKE OK")
    ctx.close()
