// Shared by scripts/release.mjs (CAP) and scripts/release-app.mjs (Connecttech app): GitHub CLI calls, CHANGELOG
// notes, and update.json on the `update` branch. Both releases write update.json; each keeps the other's fields.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const read = (path) => readFileSync(join(root, path), 'utf8');
export const dryRun = process.argv.includes('--dry-run');

export function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** `gh api` with an optional JSON body; returns the parsed answer, or null on a 404 when `allow404` is set. */
export function ghApi(args, body, allow404 = false) {
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

/** The public repository and the branch holding update.json, as CAP reads them (src/lib/update.ts). */
export function target() {
  const update = read('src/lib/update.ts');
  const repo = /UPDATE_REPO = '([^']+)'/.exec(update)?.[1];
  const branch = /UPDATE_BRANCH = '([^']+)'/.exec(update)?.[1];
  if (!repo || !branch) throw new Error('UPDATE_REPO or UPDATE_BRANCH not found in src/lib/update.ts');
  return { repo, branch };
}

/** The body of `## [version]` in a CHANGELOG file. */
export function changelogNotes(file, version) {
  const changelog = read(file);
  const start = changelog.indexOf(`## [${version}]`);
  if (start === -1) throw new Error(`${file} has no section for ${version}. Add it before releasing.`);
  const next = changelog.indexOf('\n## [', start + 1);
  return changelog.slice(changelog.indexOf('\n', start) + 1, next === -1 ? undefined : next).trim();
}

export function alreadyReleased(repo, tag) {
  return Boolean(ghApi([`repos/${repo}/releases/tags/${tag}`], undefined, true));
}

/**
 * Creates the release. In CI (a merge into main) the tag is created on the merged commit; by hand, the tag must
 * already be pushed. `latest: false` keeps it from becoming the repository's "Latest" release.
 */
export function createRelease({ repo, tag, files, notes, latest = true }) {
  const notesFile = join(mkdtempSync(join(tmpdir(), 'cap-release-')), 'notes.md');
  writeFileSync(notesFile, notes);
  const where = process.env.GITHUB_SHA ? ['--target', process.env.GITHUB_SHA] : ['--verify-tag'];
  run('gh', ['release', 'create', tag, ...files, '--repo', repo, ...where, '--title', tag, '--notes-file', notesFile, `--latest=${latest}`]);
}

/** The current update.json on the update branch ({} when there is none). */
export function readUpdateJson(repo, branch) {
  const file = ghApi([`repos/${repo}/contents/update.json?ref=${branch}`], undefined, true);
  if (!file?.content) return {};
  try {
    return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
  } catch {
    return {};
  }
}

/** One commit on the update branch holding update.json and nothing else. */
export function writeUpdateJson(repo, branch, manifest, message) {
  const parent = ghApi([`repos/${repo}/git/ref/heads/${branch}`], undefined, true)?.object?.sha ?? null;
  const tree = ghApi(['-X', 'POST', `repos/${repo}/git/trees`], {
    tree: [{ path: 'update.json', mode: '100644', type: 'blob', content: `${JSON.stringify(manifest, null, 2)}\n` }],
  }).sha;
  const commit = ghApi(['-X', 'POST', `repos/${repo}/git/commits`], { message, tree, parents: parent ? [parent] : [] }).sha;
  if (parent) ghApi(['-X', 'PATCH', `repos/${repo}/git/refs/heads/${branch}`], { sha: commit });
  else ghApi(['-X', 'POST', `repos/${repo}/git/refs`], { ref: `refs/heads/${branch}`, sha: commit });
}
