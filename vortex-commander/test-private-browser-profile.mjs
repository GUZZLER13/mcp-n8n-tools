import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { privateBrowserProfile } from './private-browser-profile.mjs';

test('private profile survives reuse, and shared or symlinked paths are rejected',
  { skip: process.platform === 'win32' }, t => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vortex-profile-'));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    fs.chmodSync(home, 0o700);
    const profile = privateBrowserProfile(home);
    const marker = path.join(profile, 'fictional-session');
    fs.writeFileSync(marker, 'fictional-state', { mode: 0o600 });
    assert.equal(privateBrowserProfile(home), profile);
    assert.equal(fs.readFileSync(marker, 'utf8'), 'fictional-state');
    fs.chmodSync(profile, 0o750);
    assert.throws(() => privateBrowserProfile(home), /must be private/);
    fs.chmodSync(profile, 0o700);
    const other = fs.mkdtempSync(path.join(home, 'other-'));
    fs.renameSync(path.join(home, '.local'), path.join(home, 'old-local'));
    fs.symlinkSync(other, path.join(home, '.local'));
    assert.throws(() => privateBrowserProfile(home), /must be private/);
  });
