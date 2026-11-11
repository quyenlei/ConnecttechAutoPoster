// Publishes a Connecttech app (launcher/) version: normally run by .github/workflows/release.yml when a merge into
// main carries a launcher/package.json version that has no release yet.
// 1. creates the GitHub release `app-v<version>` with the installers the workflow built (in .output/launcher/) and
//    the launcher/CHANGELOG.md section as notes. It is never marked "Latest": that badge stays on CAP's releases,
//    which CAP's fallback update check reads;
// 2. then sets `app` in update.json on the `update` branch (version, release page, one download link per system),
//    keeping CAP's fields. The app reads it to say "Có bản app mới"; README links the release page.
// `--dry-run` prints the notes, assets and update.json without publishing.
import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { alreadyReleased, changelogNotes, createRelease, dryRun, read, readUpdateJson, root, target, writeUpdateJson } from './release-common.mjs';

const { version } = JSON.parse(read('launcher/package.json'));
const { repo, branch } = target();
const tag = `app-v${version}`;
const notes = changelogNotes('launcher/CHANGELOG.md', version);

// upload-artifact may keep subfolders: attach the files inside, not the folders.
const filesIn = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesIn(join(dir, e.name)) : [join(dir, e.name)]));
const dir = join(root, '.output', 'launcher');
const files = existsSync(dir) ? filesIn(dir) : [];
if (!dryRun && files.length === 0) throw new Error('No app installers in .output/launcher.');

/** "Connecttech-mac-arm64.dmg" -> "mac-arm64.dmg" as the key of its download link. */
const downloads = Object.fromEntries(
  files.map((file) => [basename(file).replace(/^Connecttech-/, ''), `https://github.com/${repo}/releases/download/${tag}/${basename(file)}`]),
);
const manifest = {
  ...readUpdateJson(repo, branch),
  app: { version, pageUrl: `https://github.com/${repo}/releases/tag/${tag}`, downloads, publishedAt: new Date().toISOString() },
};

if (dryRun) {
  console.log(`Dry run: ${tag} to ${repo}\n\n${notes}\n\nAssets: ${files.join(', ') || '(built in CI)'}\n\nupdate.json on ${branch}:\n${JSON.stringify(manifest, null, 2)}`);
  process.exit(0);
}

if (alreadyReleased(repo, tag)) {
  console.log(`${tag} is already released on ${repo}; nothing to publish.`);
  process.exit(0);
}

console.log(`Publishing ${tag} to ${repo}`);
createRelease({ repo, tag, files, notes, latest: false });
writeUpdateJson(repo, branch, manifest, `chore: point update.json app to ${tag}`);
console.log(`update.json on ${branch} now lists app ${version}`);
