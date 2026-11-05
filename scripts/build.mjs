import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const packageUrl = new URL('../package.json', import.meta.url);
const source = readFileSync(packageUrl, 'utf8');
const packageJson = JSON.parse(source);
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(packageJson.version);
if (!match) throw new Error('package.json version must be major.minor.patch');

const nextVersion = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
packageJson.version = nextVersion;
writeFileSync(packageUrl, `${JSON.stringify(packageJson, null, 2)}\n`);
console.log(`Building version ${nextVersion}`);

const result = spawnSync('pnpm', ['exec', 'wxt', 'build'], { cwd: new URL('..', import.meta.url), stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
