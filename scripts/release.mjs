// Publishes the current version for the in-extension update check (normally run by .github/workflows/release.yml
// when a tag `v<version>` is pushed; it also works by hand with the GitHub CLI logged in):
// 1. zips the build and the updater helper's installers (updater/), and creates the GitHub release `v<version>` in
//    the public CAP repository (UPDATE_REPO in src/lib/update.ts) with them attached and the CHANGELOG section of
//    that version as notes; the tag must already be pushed;
// 2. only then points `update.json` on the `update` branch (UPDATE_BRANCH) at that release, so CAP never
//    announces a version whose zip does not exist yet. update.json carries the zip's SHA-256 for the helper.
// Connecttech launcher installers built by the workflow's `launcher` job are attached from .output/launcher/ when
// that folder exists.
// It does not bump the version. `--dry-run` builds the zips and prints the notes and update.json without publishing.
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const dryRun = process.argv.includes('--dry-run');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** `gh api` with an optional JSON body; returns the parsed answer, or null on a 404 when `allow404` is set. */
function ghApi(args, body, allow404 = false) {
  const input = body === undefined ? undefined : JSON.stringify(body);
  const result = spawnSync('gh', ['api', ...args, ...(input === undefined ? [] : ['--input', '-'])], { cwd: root, input, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (allow404 && /HTTP 404/.test(result.stderr)) return null;
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

const { name, version } = JSON.parse(read('package.json'));
const update = read('src/lib/update.ts');
const repo = /UPDATE_REPO = '([^']+)'/.exec(update)?.[1];
const branch = /UPDATE_BRANCH = '([^']+)'/.exec(update)?.[1];
if (!repo || !branch) throw new Error('UPDATE_REPO or UPDATE_BRANCH not found in src/lib/update.ts');
const tag = `v${version}`;

// In CI the pushed tag must match package.json, so a tag never publishes another version's build.
const ref = process.env.GITHUB_REF_NAME;
if (ref && ref !== tag) throw new Error(`Tag ${ref} does not match package.json version ${version}.`);

const changelog = read('CHANGELOG.md');
const start = changelog.indexOf(`## [${version}]`);
if (start === -1) throw new Error(`CHANGELOG.md has no section for ${version}. Add it before releasing.`);
const next = changelog.indexOf('\n## [', start + 1);
const notes = changelog.slice(changelog.indexOf('\n', start) + 1, next === -1 ? undefined : next).trim();

const zipName = `${name}-${version}-chrome.zip`;
run('pnpm', ['exec', 'wxt', 'zip']);
const zip = join(root, '.output', zipName);
if (!existsSync(zip)) throw new Error(`Zip not found: ${zip}`);

// The helper's installers, under fixed names so releases/latest/download/<name> always works.
// `zip -X` leaves out extra file attributes but keeps the Unix permissions the macOS and Linux scripts need.
const installers = [
  ['cap-updater-windows.zip', 'updater/windows', ['install.bat', 'install.ps1', 'cap-updater.ps1']],
  ['cap-updater-mac.zip', 'updater/mac', ['install.command', 'cap-updater.sh']],
  ['cap-updater-linux.zip', 'updater/linux', ['install.sh', 'cap-updater.sh']],
].map(([file, dir, names]) => {
  const out = join(root, '.output', file);
  rmSync(out, { force: true });
  const result = spawnSync('zip', ['-X', '-q', out, ...names], { cwd: join(root, dir), stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Could not zip ${dir}`);
  return out;
});

const manifest = {
  version,
  pageUrl: `https://github.com/${repo}/releases/tag/${tag}`,
  zipUrl: `https://github.com/${repo}/releases/download/${tag}/${zipName}`,
  sha256: createHash('sha256').update(readFileSync(zip)).digest('hex'),
  publishedAt: new Date().toISOString(),
};

// Desktop app installers (launcher/), downloaded into .output/launcher/ by the release workflow.
const launcherDir = join(root, '.output', 'launcher');
const launcher = existsSync(launcherDir) ? readdirSync(launcherDir).map((name) => join(launcherDir, name)) : [];

if (dryRun) {
  console.log(`Dry run: ${tag} to ${repo}\n\n${notes}\n\nAssets: ${[zip, ...installers, ...launcher].join(', ')}\n\nupdate.json on ${branch}:\n${JSON.stringify(manifest, null, 2)}`);
  process.exit(0);
}

const notesFile = join(mkdtempSync(join(tmpdir(), 'cap-release-')), 'notes.md');
writeFileSync(notesFile, notes);
console.log(`Publishing ${tag} to ${repo}`);
run('gh', ['release', 'create', tag, zip, ...installers, ...launcher, '--repo', repo, '--verify-tag', '--title', tag, '--notes-file', notesFile]);

// One commit per release on the `update` branch, holding update.json and nothing else.
const parent = ghApi([`repos/${repo}/git/ref/heads/${branch}`], undefined, true)?.object?.sha ?? null;
const tree = ghApi(['-X', 'POST', `repos/${repo}/git/trees`], {
  tree: [{ path: 'update.json', mode: '100644', type: 'blob', content: `${JSON.stringify(manifest, null, 2)}\n` }],
}).sha;
const commit = ghApi(['-X', 'POST', `repos/${repo}/git/commits`], {
  message: `chore: point update.json to ${tag}`,
  tree,
  parents: parent ? [parent] : [],
}).sha;
if (parent) ghApi(['-X', 'PATCH', `repos/${repo}/git/refs/heads/${branch}`], { sha: commit });
else ghApi(['-X', 'POST', `repos/${repo}/git/refs`], { ref: `refs/heads/${branch}`, sha: commit });
console.log(`update.json on ${branch} now points to ${tag}`);
