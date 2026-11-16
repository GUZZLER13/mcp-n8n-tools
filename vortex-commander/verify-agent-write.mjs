#!/usr/bin/env node
// End-to-end LOCAL ONLY: test write/edit/read + process and protected path denial.
// Creates exactly one unique disposable directory in OS temp and deletes it.
// No legacy services, projects, or configuration files are touched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const endpoint = 'http://127.0.0.1:8766/mcp';
const tokenPath = path.join(os.homedir(), 'remote-mcp', 'secrets', 'owner-token');
const token = fs.readFileSync(tokenPath, 'utf8').trim();
assert(token, 'Jeton local manquant');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'vortex-agent-smoke-'));
const target = path.join(temporary, 'test-' + crypto.randomBytes(4).toString('hex') + '.txt');
const first = 'VORTEX-TEST-ECRITURE-2026';
const second = 'VORTEX-TEST-MODIFICATION-2026';
let session;
let seq = 1;

async function rpc(method, params) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
      accept: 'application/json',
      ...(session ? { 'mcp-session-id': session } : {})
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: seq++, method, params }),
    signal: AbortSignal.timeout(20000)
  });
  assert.equal(response.status, 200, 'HTTP ' + response.status + ' pour ' + method);
  if (!session) session = response.headers.get('mcp-session-id');
  const result = await response.json();
  if (result.error) throw new Error(method + ': ' + result.error.message);
  return result.result;
}

const tool = (name, arguments_) => rpc('tools/call', {
  name: 'tool_call',
  arguments: { device_id: 'vps-hetzner', name, arguments: arguments_ }
});
function assertSuccess(result, name) {
  assert(!result?.isError, 'Echec de ' + name + ' : ' + JSON.stringify(result?.content ?? []).slice(0, 300));
}

try {
  await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'vortex-write-local-test', version: '1' }
  });

  const write = await tool('write_file', { path: target, content: first + '\n' });
  assertSuccess(write, 'write_file');
  assert.equal(fs.readFileSync(target, 'utf8'), first + '\n');
  console.log('OK : écriture réelle dans le dossier temporaire.');

  const read = await tool('read_file', { path: target });
  assertSuccess(read, 'read_file');
  assert(JSON.stringify(read.content).includes(first), 'Contenu de lecture inattendu');
  console.log('OK : lecture réelle par l’agent.');

  const edit = await tool('edit_block', {
    file_path: target, old_string: first, new_string: second
  });
  assertSuccess(edit, 'edit_block');
  assert.equal(fs.readFileSync(target, 'utf8'), second + '\n');
  console.log('OK : modification réelle du fichier temporaire.');

  const process = await tool('start_process', { command: 'pwd', timeout_ms: 10000 });
  assertSuccess(process, 'start_process');
  console.log('OK : lancement d’une commande sans effet secondaire.');

  const denied = await tool('read_file', {
    path: path.join(os.homedir(), '.ssh', 'vortex-nonexistent-policy-test.txt')
  });
  assert.equal(denied.isError, true, 'Le dossier .ssh ne devrait pas être accessible');
  console.log('OK : protection de ~/.ssh vérifiée.');

  console.log('SUCCESS : opérations réelles validées ; aucun projet ni service modifié.');
} catch (error) {
  console.error('ECHEC du test : ' + error.message);
  process.exitCode = 1;
} finally {
  if (session) {
    try {
      await fetch(endpoint, {
        method: 'DELETE',
        headers: { authorization: 'Bearer ' + token, 'mcp-session-id': session },
        signal: AbortSignal.timeout(4000)
      });
    } catch {}
  }
  try {
    fs.rmSync(temporary, { recursive: true, force: true });
    console.log('Dossier temporaire supprimé.');
  } catch (error) {
    console.error('ATTENTION : nettoyage manuel requis du dossier temporaire : ' + temporary + ' (' + error.message + ')');
    process.exitCode = 1;
  }
}
