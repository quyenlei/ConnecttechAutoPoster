import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXTENSION_ID,
  isMissingHost,
  parsePingReply,
  parseUpdateReply,
  runsFromOtherFolder,
  UPDATER_DOWNLOADS,
  UPDATER_HOST,
  updaterErrorMessage,
  updaterOs,
} from '../src/lib/updater';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('updater helper', () => {
  it('uses the ID that the manifest key produces, in the code and in both installers', () => {
    const key = /key: '([A-Za-z0-9+/=]+)'/.exec(read('wxt.config.ts'))?.[1];
    expect(key).toBeTruthy();
    const hex = createHash('sha256').update(Buffer.from(key ?? '', 'base64')).digest('hex').slice(0, 32);
    const id = [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
    expect(EXTENSION_ID).toBe(id);
    for (const installer of ['updater/mac/install.command', 'updater/windows/install.ps1']) {
      const text = read(installer);
      expect(text).toMatch(new RegExp(`Id?\\s*=\\s*["']${id}["']`, 'i'));
      expect(text).toContain(UPDATER_HOST);
    }
  });

  it('reads the ping answer', () => {
    expect(parsePingReply({ ok: true, helper: 1, version: '0.7.4', folder: 'C:\\Users\\a\\CAP' })).toEqual({ version: '0.7.4', folder: 'C:\\Users\\a\\CAP' });
    expect(parsePingReply({ ok: true, helper: 1, version: null, folder: '' })).toEqual({ version: null, folder: null });
    expect(parsePingReply({ ok: true, helper: 2 })).toBeNull();
    expect(parsePingReply({ ok: false, code: 'unknown' })).toBeNull();
    expect(parsePingReply('x')).toBeNull();
  });

  it('reads the update answer and maps errors to Vietnamese messages', () => {
    expect(parseUpdateReply({ ok: true, version: '0.7.5', changed: true })).toEqual({ ok: true, version: '0.7.5', changed: true });
    expect(parseUpdateReply({ ok: false, code: 'checksum' })).toEqual({ ok: false, code: 'checksum' });
    expect(parseUpdateReply({ ok: true, version: 'latest', changed: true })).toEqual({ ok: false, code: 'unknown' });
    expect(parseUpdateReply(undefined)).toEqual({ ok: false, code: 'unknown' });
    expect(updaterErrorMessage('checksum')).toContain('mã kiểm tra');
    expect(updaterErrorMessage('whatever')).toContain('Trình cập nhật gặp lỗi');
  });

  it('tells a missing helper apart from other errors', () => {
    expect(isMissingHost('Specified native messaging host not found.')).toBe(true);
    expect(isMissingHost('Access to the specified native messaging host is forbidden.')).toBe(true);
    expect(isMissingHost('Native host has exited.')).toBe(false);
  });

  it('notices when CAP runs from another folder than the helper updates', () => {
    const state = { checkedAt: 1, installed: true, version: '0.7.4', folder: '/x' };
    expect(runsFromOtherFolder(state, '0.7.4')).toBe(false);
    expect(runsFromOtherFolder(state, '0.7.3')).toBe(true);
    expect(runsFromOtherFolder({ ...state, installed: false }, '0.7.3')).toBe(false);
    expect(runsFromOtherFolder(null, '0.7.3')).toBe(false);
  });

  it('offers the installer for Windows and macOS only, from github.com', () => {
    expect(updaterOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130')).toBe('win');
    expect(updaterOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130')).toBe('mac');
    expect(updaterOs('Mozilla/5.0 (X11; Linux x86_64) Chrome/130')).toBeNull();
    for (const url of Object.values(UPDATER_DOWNLOADS)) expect(url).toMatch(/^https:\/\/github\.com\/.+\/releases\/latest\/download\/cap-updater-(windows|mac)\.zip$/);
  });
});
