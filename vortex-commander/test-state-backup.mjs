import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openDb } from '../gateway/db.js';

test('encrypted online backup includes committed WAL data, restores and preserves all tables', t => {
  const work = mkdtempSync(join(tmpdir(), 'vortex-backup-test-'));
  chmodSync(work, 0o700);
  let db;
  t.after(() => {
    db?.close();
    rmSync(work, { force: true, recursive: true });
  });
  const sourceFile = join(work, 'live.sqlite');
  const output = join(work, 'vortex-state.vxb');
  const keyFile = join(work, 'backup.key');
  const wrongKey = join(work, 'wrong.key');
  const altered = join(work, 'altered.vxb');
  const executable = resolve('gateway/state-backup.mjs');
  writeFileSync(keyFile, randomBytes(32), { flag: 'wx', mode: 0o600 });
  writeFileSync(wrongKey, randomBytes(32), { flag: 'wx', mode: 0o600 });
  db = openDb(sourceFile);
  db.exec('PRAGMA wal_autocheckpoint = 0');
  const secret = 'confidential-' + randomBytes(24).toString('hex');
  db.prepare('INSERT INTO devices(device_id,secret_hash,created_at) VALUES(?,?,?)')
    .run('test-device',secret,'2026-11-17T00:00:00.000Z');
  db.prepare('INSERT INTO audit_logs(timestamp,tool,status,error_detail) VALUES(?,?,?,?)')
    .run('2026-11-17T00:00:00.000Z','read_file','success',null);
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?)')
    .run('existing_setting','preserve');
  assert.ok(readFileSync(sourceFile + '-wal').length > 32, 'committed WAL frames must exist');
  const exec = (action, file = output, passwordFile = keyFile) => {
    const args = action === 'snapshot'
      ? [executable, action, '--db', sourceFile, '--out', file, '--key-file', passwordFile]
      : [executable, action, '--file', file, '--key-file', passwordFile];
    return spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 15000 });
  };
  const created = exec('snapshot');
  assert.equal(created.status,0,created.stderr);
  const metadata = JSON.parse(created.stdout);
  assert.equal(metadata.result,'BACKUP_CREATED');
  assert.equal(metadata.tableCounts.devices,1);
  assert.equal(metadata.tableCounts.audit_logs,1);
  assert.equal(metadata.tableCounts.settings,1);
  const encrypted = readFileSync(output);
  assert.equal(encrypted.includes(Buffer.from(secret)),false,'credentials must remain encrypted');
  assert.equal(encrypted.includes(Buffer.from('SQLite format 3')),false,'plaintext must not be saved');
  const restored = exec('verify');
  assert.equal(restored.status,0,restored.stderr);
  const checked = JSON.parse(restored.stdout);
  assert.equal(checked.result,'RESTORE_VERIFIED');
  assert.equal(checked.tableCounts.devices,1);
  assert.equal(checked.tableCounts.audit_logs,1);
  assert.equal(checked.tableCounts.oauth_tokens,0);
  assert.equal(checked.integrityCheck,'ok');
  assert.equal(exec('snapshot').status,1,'do not overwrite an existing backup');
  const wrong = exec('verify', output, wrongKey);
  assert.equal(wrong.status,1,'wrong key must fail verification');
  assert.doesNotMatch(wrong.stdout + wrong.stderr,/confidential-|test-device|BEGIN/i);
  const corrupted = Buffer.from(encrypted);
  corrupted[corrupted.length - 17] ^= 1;
  writeFileSync(altered, corrupted, { flag: 'wx', mode: 0o600 });
  assert.equal(exec('verify', altered).status, 1, 'altered ciphertext must fail verification');
  assert.equal(db.prepare('SELECT count(*) AS n FROM devices').get().n,1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM audit_logs').get().n,1);
  assert.deepEqual(readdirSync(work).filter(name => name.startsWith('.vortex-snapshot-work-')),[],
    'plaintext temporary copies must be cleaned up');
});
