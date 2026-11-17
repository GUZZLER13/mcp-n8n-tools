#!/usr/bin/env node
// Administrator-run, offline backup utility for the VORTEX SQLite state.
// This is not an MCP tool and must NEVER be callable through a browser or agent.
// It preserves WAL-committed data using SQLite's online backup API.
// Invocation (by an authorized gateway operator only):
// node gateway/state-backup.mjs snapshot --db /private/state.db --out /safe/backup.vxb --key-file /safe/backup.key
// node gateway/state-backup.mjs verify --file /safe/backup.vxb --key-file /safe/backup.key
import { DatabaseSync, backup } from 'node:sqlite';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';

const LIMIT = 128 * 1024 * 1024;
const usage = () => {
  throw Error('usage: snapshot --db ABS_PATH --out ABS_PATH --key-file ABS_PATH | verify --file ABS_PATH --key-file ABS_PATH');
};
const [action, ...argv] = process.argv.slice(2);
const flags = new Map();
for (let i = 0; i < argv.length; i += 2) {
  if (!argv[i]?.startsWith('--') || argv[i + 1] === undefined || flags.has(argv[i])) usage();
  flags.set(argv[i], argv[i + 1]);
}
const option = key => {
  const value = flags.get('--' + key);
  if (!value || !isAbsolute(value)) usage();
  return value;
};
function safeFile(file, privateMode = false) {
  const s = lstatSync(file);
  if (!s.isFile() || s.isSymbolicLink()) throw Error('UNSAFE_FILE');
  if (privateMode && process.platform !== 'win32' && (s.mode & 0o077))
    throw Error('PRIVATE_FILE_PERMISSIONS');
  return s;
}
const key = () => {
  const f = option('key-file');
  safeFile(f, true);
  const k = readFileSync(f);
  if (k.length !== 32) throw Error('KEY_MUST_BE_32_BYTES');
  return k;
};
const sha = buffer => createHash('sha256').update(buffer).digest('hex');
function snapshotStats(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get();
    if (integrity?.integrity_check !== 'ok') throw Error('SQLITE_INTEGRITY_CHECK_FAILED');
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all().map(row => row.name);
    const counts = {};
    for (const name of tables) {
      // Names originate only from the SQLite catalog; quote safely regardless.
      const quoted = '"' + name.replaceAll('"', '""') + '"';
      counts[name] = Number(db.prepare('SELECT count(*) AS n FROM ' + quoted).get().n);
    }
    const required = ['devices', 'client_tokens', 'sessions', 'settings', 'audit_logs',
      'device_backends', 'oauth_clients', 'oauth_tokens'];
    if (required.some(name => !Object.hasOwn(counts, name)))
      throw Error('VORTEX_SCHEMA_INCOMPLETE');
    return counts;
  } finally {
    db.close();
  }
}
const workDir = parent => mkdtempSync(join(parent, '.vortex-snapshot-work-'));
function requirePrivateDir(dir) {
  const s = lstatSync(dir);
  if (!s.isDirectory() || s.isSymbolicLink()) throw Error('UNSAFE_BACKUP_DIRECTORY');
  if (process.platform !== 'win32' && (s.mode & 0o077))
    throw Error('BACKUP_DIRECTORY_MUST_BE_0700');
}
async function snapshot() {
  if (flags.size !== 3) usage();
  const dbPath = option('db'), output = option('out'), k = key();
  safeFile(dbPath);
  if (existsSync(output)) throw Error('BACKUP_EXISTS_REFUSING_OVERWRITE');
  const outDir = dirname(output);
  requirePrivateDir(outDir);
  const tempDir = workDir(outDir);
  const sqliteCopy = join(tempDir, 'consistent.sqlite');
  const encryptedPending = join(tempDir, 'encrypted.pending');
  try {
    const live = new DatabaseSync(dbPath, { readOnly: true });
    try {
      await backup(live, sqliteCopy);
    } finally {
      live.close();
    }
    chmodSync(sqliteCopy, 0o600);
    const size = safeFile(sqliteCopy).size;
    if (!size || size > LIMIT) throw Error('SQLITE_SNAPSHOT_SIZE_LIMIT');
    const counts = snapshotStats(sqliteCopy);
    const clear = readFileSync(sqliteCopy);
    const iv = randomBytes(12);
    const header = Buffer.from(JSON.stringify({
      format: 'vortex-sqlite-aes256gcm', version: 1, createdAt: new Date().toISOString(),
      iv: iv.toString('hex'), sqliteSha256: sha(clear), counts
    }) + '\n', 'utf8');
    if (header.length > 8192) throw Error('BACKUP_HEADER_TOO_LARGE');
    const cipher = createCipheriv('aes-256-gcm', k, iv);
    cipher.setAAD(header);
    const encrypted = Buffer.concat([cipher.update(clear), cipher.final()]);
    writeFileSync(encryptedPending, Buffer.concat([header, encrypted, cipher.getAuthTag()]), { flag: 'wx', mode: 0o600 });
    chmodSync(encryptedPending, 0o600);
    renameSync(encryptedPending, output);
    console.log(JSON.stringify({
      result: 'BACKUP_CREATED', file: basename(output),
      encryptedBytes: lstatSync(output).size, tableCounts: counts,
      verifiedSqliteIntegrity: true
    }));
  } finally {
    k.fill(0);
    rmSync(tempDir, { recursive: true, force: true });
  }
}
async function verify() {
  if (flags.size !== 2) usage();
  const file = option('file'), k = key();
  const targetDir = dirname(file);
  requirePrivateDir(targetDir);
  const size = safeFile(file, true).size;
  if (size < 120 || size > LIMIT + 8192 + 16) throw Error('INVALID_ENCRYPTED_BACKUP_SIZE');
  const tempDir = workDir(targetDir);
  try {
    const data = readFileSync(file);
    const nl = data.indexOf(10);
    if (nl < 2 || nl > 8192) throw Error('BACKUP_HEADER_INVALID');
    const header = data.subarray(0, nl + 1);
    const meta = JSON.parse(header.subarray(0, -1).toString('utf8'));
    if (meta.format !== 'vortex-sqlite-aes256gcm' || meta.version !== 1 ||
        !/^[a-f0-9]{24}$/.test(meta.iv) ||
        !/^[a-f0-9]{64}$/.test(meta.sqliteSha256))
      throw Error('BACKUP_METADATA_INVALID');
    const decipher = createDecipheriv('aes-256-gcm', k, Buffer.from(meta.iv, 'hex'));
    decipher.setAAD(header);
    decipher.setAuthTag(data.subarray(-16));
    const sqlite = Buffer.concat([decipher.update(data.subarray(nl + 1, -16)), decipher.final()]);
    if (sha(sqlite) !== meta.sqliteSha256) throw Error('SQLITE_SHA256_MISMATCH');
    const tempSqlite = join(tempDir, 'restored.sqlite');
    writeFileSync(tempSqlite, sqlite, { flag: 'wx', mode: 0o600 });
    const counts = snapshotStats(tempSqlite);
    if (JSON.stringify(counts) !== JSON.stringify(meta.counts))
      throw Error('RESTORE_COUNTS_MISMATCH');
    console.log(JSON.stringify({
      result: 'RESTORE_VERIFIED', file: basename(file),
      createdAt: meta.createdAt, tableCounts: counts,
      authenticated: true, integrityCheck: 'ok',
      sourceDbUnmodified: true
    }));
  } finally {
    k.fill(0);
    rmSync(tempDir, { recursive: true, force: true });
  }
}
try {
  if (action === 'snapshot') await snapshot();
  else if (action === 'verify') await verify();
  else usage();
} catch (e) {
  // No paths, SQL, session details or cryptographic key material in logs.
  console.error(JSON.stringify({
    result: 'FAILED',
    reason: String(e.message || 'UNKNOWN').replaceAll(/[/\\][^\s]+/g, '[private]')
  }));
  process.exitCode = 1;
}
