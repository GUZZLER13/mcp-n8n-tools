#!/usr/bin/env node
// Read-only end-to-end smoke test of the actual VPS agent over loopback.
// Owner token is read privately from the VPS, never printed, never sent via HTTPS.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const endpoint = 'http://127.0.0.1:8766/mcp';
const tokenFile = path.join(os.homedir(), 'remote-mcp', 'secrets', 'owner-token');
const token = fs.readFileSync(tokenFile, 'utf8').trim();
assert(token, 'Owner token empty');
let sid;
async function rpc(method, params, id) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'authorization': 'Bearer ' + token,
      'content-type': 'application/json',
      'accept': 'application/json',
      ...(sid ? { 'mcp-session-id': sid } : {})
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(res.status, 200, method + ' HTTP ' + res.status);
  if (!sid) sid = res.headers.get('mcp-session-id');
  const body = await res.json();
  if (body.error) throw new Error(method + ' MCP error: ' + body.error.message);
  return body.result;
}
function readText(result) {
  const text = result?.content?.find(x => x.type === 'text')?.text;
  assert.equal(typeof text, 'string', 'MCP text response missing');
  return text;
}
async function main() {
  const init = await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {}, clientInfo: { name: 'vortex-local-readonly-check', version: '1' }
  }, 1);
  assert.equal(init.serverInfo.name, 'remote-mcp-gateway');
  console.log('OK: session MCP authentifiee en local.');
  const devices = JSON.parse(readText(await rpc('tools/call', {
    name: 'devices_list', arguments: {}
  }, 2)));
  const vps = devices.find(x => x.device_id === 'vps-hetzner');
  assert(vps, 'VPS absent de la liste');
  assert.equal(vps.status, 'online', 'VPS non connecte');
  console.log('OK: agent vps-hetzner connecte.');
  const tools = JSON.parse(readText(await rpc('tools/call', {
    name: 'tools_list', arguments: { device_id: 'vps-hetzner' }
  }, 3)));
  const names = tools.servers?.flatMap(x => x.tools?.map(t => t.name) ?? []) ?? [];
  assert(names.length > 0, 'Aucun outil annonce par agent');
  console.log('OK: ' + names.length + ' outils declares par agent.');
  const target = names.includes('get_file_info') ? 'get_file_info'
    : names.includes('list_directory') ? 'list_directory' : null;
  assert(target, 'Ni get_file_info ni list_directory exposes');
  const targetPath = target === 'get_file_info'
    ? path.join(os.homedir(), 'vortex-commander-kit', 'vortex-commander', 'README.md')
    : path.join(os.homedir(), 'vortex-commander-kit', 'vortex-commander');
  const reading = await rpc('tools/call', {
    name: 'tool_call', arguments: {
      device_id: 'vps-hetzner', name: target, arguments: { path: targetPath }
    }
  }, 4);
  assert.notEqual(reading.isError, true, target + ' backend error');
  assert(reading.content?.length > 0, 'No backend content');
  console.log('OK: outil ' + target + ' execute sur un fichier de test du VPS.');
  console.log('Aucun fichier modifie. Aucun secret affiche.');
}
try { await main(); }
catch(e) { console.error('ECHEC: ' + e.message); process.exitCode = 1; }
finally {
  if (sid) try {
    await fetch(endpoint, {
      method: 'DELETE',
      headers: { authorization: 'Bearer ' + token, 'mcp-session-id': sid },
      signal: AbortSignal.timeout(4000)
    });
  } catch {}
}
