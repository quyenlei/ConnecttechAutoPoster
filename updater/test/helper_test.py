"""End-to-end test of the updater helper on the current OS (macOS or Windows), against a local mock of GitHub.

Runs the real installer and the real helper in a temporary home: install, then ping and update through the
native messaging protocol exactly as Chrome frames it, plus the refusals (bad checksum, foreign URL, no checksum).
Never contacts GitHub. Usage: python3 updater/test/helper_test.py
"""
import hashlib, http.server, io, json, os, platform, struct, subprocess, sys, tempfile, threading, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
UPDATER = os.path.dirname(HERE)
ID = 'ebembjpemaickbaogincmeajpgeabcbh'
HOST = 'com.connecttech.cap_updater'
WINDOWS = platform.system() == 'Windows'

files = {}  # path -> bytes served by the mock


def make_zip(version, extra):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        # Fixed 1980 dates and same-size files, like wxt's zips, so copying cannot rely on size/time.
        for name, data in [('manifest.json', json.dumps({'manifest_version': 3, 'name': 'Connecttech Auto Poster', 'version': version})),
                           (extra, 'console.log(1);')]:
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.create_system = 0  # FAT entries without Unix modes, as wxt writes them
            z.writestr(info, data)
    return buf.getvalue()


class Mock(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = files.get(self.path)
        self.send_response(200 if body is not None else 404)
        self.send_header('Content-Length', str(len(body or b'')))
        self.end_headers()
        self.wfile.write(body or b'')

    def log_message(self, *a):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Mock)
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{server.server_address[1]}'
PREFIX = f'{BASE}/releases/download/'


def publish(version, extra='background.js', sha=None, url=None):
    data = make_zip(version, extra)
    path = f'/releases/download/v{version}/cap.zip'
    files[path] = data
    info = {'version': version, 'pageUrl': 'https://github.com/x', 'zipUrl': url or BASE + path}
    if sha != 'none':
        info['sha256'] = sha or hashlib.sha256(data).hexdigest()
    files['/update.json'] = json.dumps(info).encode()


home = tempfile.mkdtemp(prefix='cap-updater-test-')
hosts = os.path.join(home, 'NativeMessagingHosts')
env = dict(os.environ, CAP_UPDATER_HOME=os.path.join(home, 'cap'), CAP_CHROME_HOSTS_DIR=hosts,
           CAP_UPDATE_MANIFEST_URL=BASE + '/update.json', CAP_DOWNLOAD_PREFIX=PREFIX,
           CAP_UPDATER_ALLOW_HTTP='1', CAP_UPDATER_TEST='1',
           CAP_CHROME_REGISTRY_KEY=rf'HKCU:\Software\ConnecttechAutoPosterTest\{HOST}')
REG_TEST_KEY = rf'Software\ConnecttechAutoPosterTest\{HOST}'  # never the real Chrome key
ext = os.path.join(home, 'cap', 'extension')


def installed_version():
    with open(os.path.join(ext, 'manifest.json'), encoding='utf-8') as f:
        return json.load(f)['version']


def host_manifest():
    if WINDOWS:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_TEST_KEY) as k:
            path = winreg.QueryValue(k, None)
    else:
        path = os.path.join(hosts, f'{HOST}.json')
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def native(message):
    """Starts the host the way Chrome does and exchanges one framed message."""
    host = host_manifest()['path']
    origin = f'chrome-extension://{ID}/'
    # On Windows Chrome runs: cmd.exe /d /s /c ""<host path>" <origin> --parent-window=0" (one string, not a list,
    # so Python does not re-quote it).
    cmd = f'cmd.exe /d /s /c ""{host}" {origin} --parent-window=0"' if WINDOWS else [host, origin]
    data = json.dumps(message, separators=(',', ':')).encode()
    proc = subprocess.run(cmd, input=struct.pack('<I', len(data)) + data, capture_output=True, env=env, timeout=600)
    out = proc.stdout
    assert len(out) >= 4, f'no reply: {out!r} stderr: {proc.stderr.decode(errors="replace")}'
    (n,) = struct.unpack('<I', out[:4])
    assert len(out) == 4 + n, f'reply framing: {out!r}'
    return json.loads(out[4:].decode('utf-8'))


# 1. Install: registers the host for CAP only and downloads the current release.
publish('9.9.1', extra='old.js')
installer = [os.path.join(UPDATER, 'windows', 'install.bat')] if WINDOWS else ['/bin/bash', os.path.join(UPDATER, 'mac', 'install.command')]
run = subprocess.run(installer, capture_output=True, env=env, timeout=600, shell=False)
assert run.returncode == 0, run.stdout.decode(errors='replace') + run.stderr.decode(errors='replace')
manifest = host_manifest()
assert manifest['name'] == HOST and manifest['type'] == 'stdio' and manifest['allowed_origins'] == [f'chrome-extension://{ID}/'], manifest
assert os.path.exists(os.path.join(ext, 'manifest.json')), 'installer output:\n' + run.stdout.decode(errors='replace') + run.stderr.decode(errors='replace')
assert installed_version() == '9.9.1' and os.path.exists(os.path.join(ext, 'old.js'))
print('install ok')

# 2. Ping reports the installed version and folder.
reply = native({'type': 'ping'})
assert reply['ok'] is True and reply['helper'] == 1 and reply['version'] == '9.9.1', reply
assert os.path.normcase(os.path.realpath(reply['folder'])) == os.path.normcase(os.path.realpath(ext)), reply
print('ping ok')

# 3. Update mirrors the new release (stale files removed); a second update changes nothing.
publish('9.9.2', extra='new.js')
assert native({'type': 'update'}) == {'ok': True, 'version': '9.9.2', 'changed': True}
assert installed_version() == '9.9.2' and os.path.exists(os.path.join(ext, 'new.js')) and not os.path.exists(os.path.join(ext, 'old.js'))
assert native({'type': 'update'}) == {'ok': True, 'version': '9.9.2', 'changed': False}
assert all(os.access(os.path.join(ext, n), os.R_OK) for n in os.listdir(ext)), 'extracted files must be readable'
print('update ok')

# 4. Refusals leave the installed files alone.
for kwargs, code in [({'sha': '0' * 64}, 'checksum'), ({'sha': 'none'}, 'checksum-missing'),
                     ({'url': 'https://evil.example/cap.zip'}, 'manifest')]:
    publish('9.9.3', **kwargs)
    reply = native({'type': 'update'})
    assert reply == {'ok': False, 'code': code}, (kwargs, reply)
    assert installed_version() == '9.9.2'
files.pop('/update.json')
assert native({'type': 'update'}) == {'ok': False, 'code': 'network'}
assert native({'type': 'nonsense'}) == {'ok': False, 'code': 'unknown'}
print('refusals ok')

if WINDOWS:
    import winreg
    winreg.DeleteKey(winreg.HKEY_CURRENT_USER, REG_TEST_KEY)
    winreg.DeleteKey(winreg.HKEY_CURRENT_USER, r'Software\ConnecttechAutoPosterTest')
server.shutdown()
print('UPDATER HELPER OK')
