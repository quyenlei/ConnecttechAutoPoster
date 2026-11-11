// Publishes the current version for the in-extension update check:
// zips the build and creates the GitHub release `v<version>` in the public CAP repository
// (UPDATE_REPO in src/lib/update.ts), with the CHANGELOG section of that version as notes.
// Run after `pnpm build` and the checks; it does not bump the version. Needs the GitHub CLI (`gh`) logged in.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const { name, version } = JSON.parse(read('package.json'));
const repo = /UPDATE_REPO = '([^']+)'/.exec(read('src/lib/update.ts'))?.[1];
if (!repo) throw new Error('UPDATE_REPO not found in src/lib/update.ts');

const changelog = read('CHANGELOG.md');
const start = changelog.indexOf(`## [${version}]`);
if (start === -1) throw new Error(`CHANGELOG.md has no section for ${version}. Add it before releasing.`);
const next = changelog.indexOf('\n## [', start + 1);
const notes = changelog.slice(changelog.indexOf('\n', start) + 1, next === -1 ? undefined : next).trim();

run('pnpm', ['exec', 'wxt', 'zip']);
const zip = join(root, '.output', `${name}-${version}-chrome.zip`);
if (!existsSync(zip)) throw new Error(`Zip not found: ${zip}`);

const notesFile = join(mkdtempSync(join(tmpdir(), 'cap-release-')), 'notes.md');
writeFileSync(notesFile, notes);
console.log(`Publishing v${version} to ${repo}`);
run('gh', ['release', 'create', `v${version}`, zip, '--repo', repo, '--title', `v${version}`, '--notes-file', notesFile]);
