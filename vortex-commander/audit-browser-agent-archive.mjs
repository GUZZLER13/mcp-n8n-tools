#!/usr/bin/env node
// Read-only verification of a candidate browser-only agent tar.gz.
// Intended for CI and an authorized NAS operator. Never extracts files.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const [file, expected] = process.argv.slice(2);
function fail(reason) {
  console.error('BROWSER_ARCHIVE_REJECTED=' + reason);
  process.exit(1);
}
if (process.argv.length !== 4 || !file || !path.isAbsolute(file) || !/^[a-f0-9]{64}$/.test(expected ?? ''))
  fail('ARGUMENTS');
let stat;
try { stat = fs.lstatSync(file); } catch { fail('NOT_FOUND'); }
if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 256 || stat.size > 100_000_000)
  fail('FILE_TYPE_OR_SIZE');
const actual = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (actual !== expected) fail('SHA256_MISMATCH');

const listing = spawnSync('/usr/bin/tar', ['-tzf', file], {
  encoding: 'utf8', maxBuffer: 20_000_000, timeout: 15000
});
if (listing.status !== 0 || listing.error) fail('TAR_LIST');
const typed = spawnSync('/usr/bin/tar', ['-tvzf', file], {
  encoding: 'utf8', maxBuffer: 20_000_000, timeout: 15000
});
if (typed.status !== 0 || typed.error) fail('TAR_TYPES');
const names = listing.stdout.split('\n').filter(Boolean);
const info = typed.stdout.split('\n').filter(Boolean);
if (names.length !== info.length || names.length < 6 || names.length > 35000)
  fail('ENTRY_COUNT');

const seen = new Set();
for (let i = 0; i < names.length; i++) {
  const name = names[i];
  if (!/^[a-zA-Z0-9@._/+~=-]+$/.test(name) ||
      name.startsWith('/') ||
      name.split('/').some(component => component === '.' || component === '..') ||
      name.includes('//'))
    fail('ENTRY_PATH');
  if (!/^(?:agent\/(?:agent\.js|backends\.js|policy\.js)?$|node_modules\/|package\.json$|package-lock\.json$)/.test(name))
    fail('UNEXPECTED_ENTRY');
  if (seen.has(name)) fail('DUPLICATE_ENTRY');
  seen.add(name);
  const type = info[i]?.[0];
  if (type !== 'd' && type !== '-') fail('LINK_OR_SPECIAL_FILE');
  if ((name.endsWith('/') && type !== 'd') || (!name.endsWith('/') && type !== '-'))
    fail('TYPE_MISMATCH');
}
for (const required of [
  'agent/agent.js', 'agent/backends.js', 'agent/policy.js',
  'package.json', 'package-lock.json', 'node_modules/ws/',
  'node_modules/@modelcontextprotocol/sdk/',
]) {
  if (!seen.has(required)) fail('REQUIRED_ENTRY_MISSING');
}
console.log(JSON.stringify({
  result: 'BROWSER_ARCHIVE_VERIFIED', sha256: actual,
  entries: names.length, noExtract: true
}));
