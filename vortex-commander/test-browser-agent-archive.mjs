// Integration tests of archive validation; all fixtures are synthetic and local.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const auditor = path.resolve('vortex-commander/audit-browser-agent-archive.mjs');
const testArchive = (extraFiles = [], extraEntries = []) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vortex-browser-tar-test-'));
  const root = path.join(dir, 'source');
  for (const folder of ['agent', 'node_modules/ws', 'node_modules/@modelcontextprotocol/sdk']) {
    fs.mkdirSync(path.join(root, folder), { recursive: true });
  }
  for (const name of [
    'agent/agent.js', 'agent/backends.js', 'agent/policy.js',
    'agent/browser-session.mjs', 'agent/browser-agent-session.mjs',
    'agent/private-browser-profile.mjs', 'package.json',
    'package-lock.json', 'node_modules/ws/index.js',
    'node_modules/@modelcontextprotocol/sdk/index.js',
  ]) {
    fs.writeFileSync(path.join(root, name), name + '\n');
  }
  for (const [name, value] of extraFiles) {
    fs.writeFileSync(path.join(root, name), value);
  }
  const archive = path.join(dir, 'agent.tar.gz');
  const pack = spawnSync('/usr/bin/tar', [
    '-czf', archive, '-C', root, 'agent', 'package.json',
    'package-lock.json', 'node_modules', ...extraEntries
  ], { encoding: 'utf8' });
  assert.equal(pack.status, 0, pack.stderr);
  const sha = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  return { dir, root, archive, sha };
};
const inspect = (file, sha) => spawnSync(process.execPath, [auditor, file, sha], {
  encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024
});
const withFixture = (t, ...args) => {
  const fixture = testArchive(...args);
  t.after(() => fs.rmSync(fixture.dir, { recursive: true, force: true }));
  return fixture;
};

test('real tar parser accepts a complete code-only archive', t => {
  const x = withFixture(t);
  const result = inspect(x.archive, x.sha);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.result, 'BROWSER_ARCHIVE_VERIFIED');
  assert.equal(report.sha256, x.sha);
  assert.equal(report.noExtract, true);
});
test('archive checker refuses a mismatching checksum', t => {
  const x = withFixture(t);
  const result = inspect(x.archive, '0'.repeat(64));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SHA256_MISMATCH/);
});
test('archive checker refuses unexpected code files', t => {
  const x = withFixture(t, [['agent/extra.js', 'unapproved']]);
  const result = inspect(x.archive, x.sha);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /UNEXPECTED_ENTRY/);
});
test('archive checker refuses symbolic links even when checksum matches', t => {
  const x = withFixture(t);
  const link = path.join(x.root, 'node_modules/ws/symlink.js');
  fs.symlinkSync('/etc/passwd', link);
  const archive = path.join(x.dir, 'linked.tar.gz');
  const packed = spawnSync('/usr/bin/tar', ['-czf', archive, '-C', x.root,
    'agent', 'package.json', 'package-lock.json', 'node_modules'], {encoding:'utf8'});
  assert.equal(packed.status, 0, packed.stderr);
  const digest = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  const result = inspect(archive, digest);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /LINK_OR_SPECIAL_FILE/);
});
test('archive checker refuses duplicate tar entries', t => {
  const x = withFixture(t, [], ['agent/agent.js']);
  const result = inspect(x.archive, x.sha);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DUPLICATE_ENTRY/);
});
