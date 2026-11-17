// Runs only on an isolated CI runner after npm has preinstalled the exact
// chrome-devtools-mcp@1.13.0 package. No network or browser profile used by the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root = process.env.VORTEX_BROWSER_STAGED_PACKAGE;
if (!root || !path.isAbsolute(root)) throw Error('VORTEX_BROWSER_STAGED_PACKAGE must be absolute');
const cli = path.join(root, 'out', 'Default', 'gen', 'src', 'bin', 'chrome-devtools-mcp.js');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('published npm archive includes the pinned direct entry point', () => {
  assert.equal(manifest.name, 'chrome-devtools-mcp');
  assert.equal(manifest.version, '1.13.0');
  assert.equal(manifest.bin['chrome-devtools-mcp'], './out/Default/gen/src/bin/chrome-devtools-mcp.js');
  assert.ok(fs.statSync(cli).isFile());
});

test('preinstalled CLI works without npx/npm or remote Chrome startup', () => {
  const output = spawnSync(process.execPath, [cli, '--help'], {
    encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024,
    env: {PATH: process.env.PATH || '/usr/bin:/bin', HOME: process.env.HOME || '/tmp'},
  });
  assert.equal(output.status, 0, output.stderr.slice(0, 1000));
  const help = output.stdout + output.stderr;
  for (const key of ['headless', 'isolated', 'executablePath', 'userDataDir']) {
    assert.match(help, new RegExp(key), 'Missing Chrome option ' + key);
  }
  for (const key of ['javascript-evaluation', 'redact-network-headers', 'usage-statistics', 'performance-crux']) {
    assert.match(help.toLowerCase(), new RegExp(key), 'Missing protection option ' + key);
  }
});
