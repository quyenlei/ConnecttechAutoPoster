"""One-click update end to end on macOS: real Chrome, real updater helper, mock GitHub. Never contacts GitHub.

1. install.command installs the helper (registered in the test profile only) and the current build as "release".
2. Chrome loads CAP from the helper's folder; the dashboard finds a newer version (99.0.0) and the helper.
3. "Cập nhật ngay" -> helper downloads and checks the mock 99.0.0 zip -> CAP reloads -> Chrome runs 99.0.0.

Usage: python3 e2e/updater_e2e.py <built_ext_dir> [chromium_exe]
"""
import hashlib, http.server, io, json, os, platform, shutil, ssl, subprocess, sys, tempfile, threading, time, zipfile
from playwright.sync_api import sync_playwright

if platform.system() != 'Darwin':
    print('updater e2e: macOS only (Windows is covered by updater/test/helper_test.py in CI)'); sys.exit(0)

build = os.path.realpath(sys.argv[1])
exe = os.path.realpath(sys.argv[2]) if len(sys.argv) > 2 else None  # default: Playwright's own Chromium
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ID = 'ebembjpemaickbaogincmeajpgeabcbh'
NEW = '99.0.0'


def zip_dir(src, version):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        for base, _, names in os.walk(src):
            for name in names:
                path = os.path.join(base, name)
                rel = os.path.relpath(path, src)
                data = open(path, 'rb').read()
                if rel == 'manifest.json':
                    m = json.loads(data); m['version'] = version; data = json.dumps(m).encode()
                info = zipfile.ZipInfo(rel, (1980, 1, 1, 0, 0, 0))  # like wxt's zips: fixed dates,
                info.create_system = 0  # FAT entries without Unix modes (unzip then uses normal permissions)
                z.writestr(info, data)
    return buf.getvalue()


current = json.load(open(os.path.join(build, 'manifest.json')))['version']
zips = {current: zip_dir(build, current), NEW: zip_dir(build, NEW)}
helper_json = {}  # what the helper reads (plain http mock)
extension_requests = []

class Helper(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = helper_json.get('body') if self.path == '/update.json' else zips.get(self.path.split('/')[-2][1:]) if self.path.startswith('/releases/download/') else None
        self.send_response(200 if body else 404); self.send_header('Content-Length', str(len(body or b''))); self.end_headers(); self.wfile.write(body or b'')
    def log_message(self, *a): pass

class Github(http.server.BaseHTTPRequestHandler):
    """raw.githubusercontent.com and api.github.com as CAP sees them (mapped by the host resolver)."""
    def do_GET(self):
        extension_requests.append(self.path)
        body = json.dumps({'version': NEW, 'pageUrl': f'https://github.com/quyenlei/ConnecttechAutoPoster/releases/tag/v{NEW}',
                           'zipUrl': f'https://github.com/quyenlei/ConnecttechAutoPoster/releases/download/v{NEW}/cap.zip'}).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass

helper_srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Helper)
threading.Thread(target=helper_srv.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{helper_srv.server_address[1]}'

tmp = tempfile.mkdtemp(prefix='cap-updater-e2e-')
subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', f'{tmp}/k.pem', '-out', f'{tmp}/c.pem', '-days', '1', '-subj', '/CN=raw.githubusercontent.com'], check=True, capture_output=True)
gh_srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Github)
ctx_ssl = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx_ssl.load_cert_chain(f'{tmp}/c.pem', f'{tmp}/k.pem')
gh_srv.socket = ctx_ssl.wrap_socket(gh_srv.socket, server_side=True)
threading.Thread(target=gh_srv.serve_forever, daemon=True).start()
gh_port = gh_srv.server_address[1]


def publish(version):
    helper_json['body'] = json.dumps({'version': version, 'pageUrl': 'https://github.com/x',
                                      'zipUrl': f'{base}/releases/download/v{version}/cap.zip',
                                      'sha256': hashlib.sha256(zips[version]).hexdigest()}).encode()


profile = os.path.join(tmp, 'profile')
home = os.path.join(tmp, 'cap')
env = dict(os.environ, CAP_UPDATER_HOME=home, CAP_CHROME_HOSTS_DIR=os.path.join(profile, 'NativeMessagingHosts'),
           CAP_UPDATE_MANIFEST_URL=f'{base}/update.json', CAP_DOWNLOAD_PREFIX=f'{base}/releases/download/',
           CAP_UPDATER_ALLOW_HTTP='1', CAP_UPDATER_TEST='1')

# 1. The user runs the installer: helper registered for this profile, current version in the helper's folder.
publish(current)
r = subprocess.run(['/bin/bash', os.path.join(repo_root, 'updater', 'mac', 'install.command')], env=env, capture_output=True, text=True)
assert r.returncode == 0, r.stdout + r.stderr
ext = os.path.join(home, 'extension')
assert json.load(open(os.path.join(ext, 'manifest.json')))['version'] == current
publish(NEW)

with sync_playwright() as p:
    # Playwright adds --disable-extensions by default; with it chrome.runtime.reload() unloads CAP for good, which a
    # real Chrome does not do. Drop it so the reload behaves as for a user.
    # channel 'chromium': the full browser in new headless mode (the default headless shell has no extensions page).
    ctx = p.chromium.launch_persistent_context(profile, executable_path=exe, channel=None if exe else 'chromium', headless=os.environ.get('E2E_HEADED') != '1', env=env,
        ignore_default_args=['--disable-extensions'],
        args=[f'--load-extension={ext}', '--no-sandbox', '--ignore-certificate-errors',
              f'--host-resolver-rules=MAP raw.githubusercontent.com 127.0.0.1:{gh_port}, MAP api.github.com 127.0.0.1:{gh_port}, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'])
    # Users load CAP with "Load unpacked", which needs Developer mode; without it Chrome disables an unpacked
    # extension when it reloads (unsupportedDeveloperExtension). Turn it on as the user has it.
    dev = ctx.new_page(); dev.goto('chrome://extensions')
    dev.evaluate('() => new Promise(r => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }, r))')
    dev.close()
    pg = ctx.new_page()
    pg.goto(f'chrome-extension://{ID}/options.html')
    pg.click("button.shell__tab:has(span:text-is('Sao lưu'))")
    pg.click("button:has-text('Kiểm tra cập nhật')")
    pg.wait_for_selector(f'text=Có bản mới {NEW}', timeout=15000)
    # 2. The helper answered the ping: the one-click button replaces the manual download.
    button = pg.locator("button:has-text('Cập nhật ngay')").first
    button.wait_for(timeout=15000)
    assert pg.locator("text=Tải bộ cài trình cập nhật").count() == 0
    # 3. Update: confirm in CAP's own dialog, then the extension reloads and Chrome runs the new files.
    button.click()
    pg.locator("dialog button:has-text('Cập nhật')").click()
    deadline = 60
    version = None
    for _ in range(deadline * 2):
        try:
            check = ctx.new_page()
            check.goto(f'chrome-extension://{ID}/options.html', timeout=5000)
            version = check.evaluate('chrome.runtime.getManifest().version')
            check.close()
            if version == NEW:
                break
        except Exception:
            pass
        time.sleep(0.5)  # the dashboard closed with the reload
    assert version == NEW, f'still running {version}'
    assert json.load(open(os.path.join(ext, 'manifest.json')))['version'] == NEW
    log = open(os.path.join(home, 'updater', 'updater.log')).read()
    assert f'"version":"{NEW}","changed":true' in log, log
    ctx.close()

shutil.rmtree(tmp, ignore_errors=True)
print(f'UPDATER E2E OK: {current} -> {NEW} with one click')
