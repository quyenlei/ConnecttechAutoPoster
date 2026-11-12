// Publishes a CAP (extension) version: normally run by .github/workflows/release.yml when a merge into main carries
// a package.json version that has no release yet; it also works by hand with the GitHub CLI logged in.
// 1. zips the build and creates the GitHub release `v<version>` with the zip and the CHANGELOG.md section as notes;
// 2. only then points update.json on the `update` branch at it (version, pages, zip and its SHA-256), so CAP never
//    announces a version whose zip does not exist yet.
// It does not bump the version. `--dry-run` builds the zip and prints the notes and update.json without publishing.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { alreadyReleased, changelogNotes, createRelease, dryRun, read, root, run, target, writeUpdateJson } from './release-common.mjs';

const { name, version } = JSON.parse(read('package.json'));
const { repo, branch } = target();
const tag = `v${version}`;
const notes = changelogNotes('CHANGELOG.md', version);

const zipName = `${name}-${version}-chrome.zip`;
run('pnpm', ['exec', 'wxt', 'zip']);
const zip = join(root, '.output', zipName);
if (!existsSync(zip)) throw new Error(`Zip not found: ${zip}`);

const manifest = {
  version,
  pageUrl: `https://github.com/${repo}/releases/tag/${tag}`,
  zipUrl: `https://github.com/${repo}/releases/download/${tag}/${zipName}`,
  sha256: createHash('sha256').update(readFileSync(zip)).digest('hex'),
  publishedAt: new Date().toISOString(),
};

if (dryRun) {
  console.log(`Dry run: ${tag} to ${repo}\n\n${notes}\n\nAssets: ${zip}\n\nupdate.json on ${branch}:\n${JSON.stringify(manifest, null, 2)}`);
  process.exit(0);
}

// Publishing twice must be harmless (a re-run, or a merge that kept an already released version): stop quietly.
if (alreadyReleased(repo, tag)) {
  console.log(`${tag} is already released on ${repo}; nothing to publish.`);
  process.exit(0);
}

console.log(`Publishing ${tag} to ${repo}`);
createRelease({ repo, tag, files: [zip], notes });
writeUpdateJson(repo, branch, manifest, `chore: point update.json to ${tag}`);
console.log(`update.json on ${branch} now points to ${tag}`);
