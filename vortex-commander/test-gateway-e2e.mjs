// Full temporary MCP chain: HTTP client -> gateway -> WSS -> agent ->
// pinned local Desktop Commander -> filesystem. Never touches production.
// Run from upstream root, after npm ci and backend installation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// Desktop Commander limits file access to the OS user's home by default.
const home = fs.mkdtempSync(path.join(os.homedir(), '.vortex-e2e-'));
fs.chmodSync(home, 0o700);
const dbPath = path.join(home, 'gateway.sqlite');
const entry = path.join(
  os.homedir(), '.local/share/vortex-commander/backend',
  'node_modules', '@wonderwhy-er', 'desktop-commander', 'dist', 'index.js'
);
const procs = [];

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
function admin(...args) {
  return execFileSync(process.execPath, ['gateway/admin.js', ...args], {
    encoding: 'utf8', env: { ...process.env, RMCP_DB: dbPath }
  });
}
function extract(value, name) {
  const match = new RegExp(name + ':\\s+(\\S+)').exec(value);
  assert.ok(match, 'Gateway did not supply ' + name);
  return match[1];
}
async function until(fn, timeout = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const value = await fn(); if (value) return value; } catch {}
    await sleep(250);
  }
  throw new Error('Timed out awaiting gateway and real backend');
}

test('complete read/write MCP relay through the actual Desktop Commander', { timeout: 115000 }, async () => {
  assert.ok(fs.existsSync(entry), 'Pinned Desktop Commander not installed: ' + entry);
  const port = await freePort();
  const base = 'http://127.0.0.1:' + port;
  const clientToken = extract(admin('client-create', 'vortex-e2e'), 'client_token');
  const deviceToken = extract(admin('device-create', 'e2e-machine'), 'device_secret');
  const inputPath = path.join(home, 'read-test.txt');
  const outputPath = path.join(home, 'write-test.txt');
  fs.writeFileSync(inputPath, 'vortex-read-marker-2026\n');
  const agentConfig = path.join(home, 'agent.json');
  fs.writeFileSync(agentConfig, JSON.stringify({
    gateway: 'ws://127.0.0.1:' + port + '/device',
    device_id: 'e2e-machine',
    device_secret: deviceToken,
    desktop_commander: { command: [process.execPath, entry] }
  }), { mode: 0o600 });
  // Test from a limited directory. This is a guardrail; OS permissions remain
  // the actual security boundary. We do not test against personal files.
  const policyPath = path.join(home, 'policy.json');
  fs.writeFileSync(policyPath, JSON.stringify({ allowed_paths: [home] }));
  // Telemetry opt-out before the first backend launch.
  const dcDir = path.join(os.homedir(), '.claude-server-commander');
  fs.mkdirSync(dcDir, { recursive: true });
  const dcConfig = path.join(dcDir, 'config.json');
  const oldConfig = fs.existsSync(dcConfig) ? fs.readFileSync(dcConfig) : null;
  fs.writeFileSync(dcConfig, JSON.stringify({ telemetryEnabled: false }));

  let failures = [];
  function start(command, args, env) {
    const processChild = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '';
    processChild.stderr.on('data', d => { stderr += String(d).slice(0, 600); });
    processChild.on('exit', code => {
      if (code !== 0 && !processChild.killed) failures.push('Child terminated with code ' + code + ': ' + stderr.slice(-400));
    });
    procs.push(processChild);
    return processChild;
  }
  let sessionId;
  async function call(method, params) {
    const response = await fetch(base + '/mcp', {
      method: 'POST', headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: 'Bearer ' + clientToken,
        ...(sessionId ? { 'mcp-session-id': sessionId } : {})
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: Math.floor(Math.random() * 1000000) + 1, method, params })
    });
    assert.equal(response.status, 200, 'MCP HTTP request failed');
    sessionId = response.headers.get('mcp-session-id') || sessionId;
    return (await response.json()).result;
  }
  try {
    start(process.execPath, ['gateway/server.js', '--host', '127.0.0.1', '--port', String(port), '--db', dbPath]);
    await until(async () => (await fetch(base + '/health')).ok, 15000);
    // No authentication means access denied before agent tool execution.
    const unauthorized = await fetch(base + '/mcp', { method: 'POST', body: '{}' });
    assert.equal(unauthorized.status, 401);
    await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'vortex-ci', version: '0.1' } });
    start(process.execPath, ['agent/agent.js', '--config', agentConfig, '--policy', policyPath]);
    await until(async () => {
      const resp = await call('tools/call', { name: 'devices_list' });
      const devices = JSON.parse(resp.content[0].text);
      return devices.some(x => x.device_id === 'e2e-machine' && x.status === 'online');
    }, 60000);
    const listing = await call('tools/list', {});
    const names = listing.tools.map(t => t.name);
    assert.ok(names.includes('read_file'), 'real backend read_file not exposed');
    assert.ok(names.includes('write_file'), 'real backend write_file not exposed');
    const read = await call('tools/call', {
      name: 'read_file', arguments: { path: inputPath, device_id: 'e2e-machine' }
    });
    assert.ok(!read.isError, 'read_file failed: ' + JSON.stringify(read).slice(0, 400));
    assert.match(JSON.stringify(read.content), /vortex-read-marker-2026/);
    const write = await call('tools/call', {
      name: 'write_file', arguments: { path: outputPath, content: 'vortex-write-marker-2026\n', device_id: 'e2e-machine' }
    });
    assert.ok(!write.isError, 'write_file failed: ' + JSON.stringify(write).slice(0, 400));
    assert.equal(fs.readFileSync(outputPath, 'utf8'), 'vortex-write-marker-2026\n');
    const listingDir = await call('tools/call', {
      name: 'list_directory', arguments: { path: home, device_id: 'e2e-machine' }
    });
    assert.ok(!listingDir.isError, 'list_directory failed: ' + JSON.stringify(listingDir).slice(0, 350));
    assert.match(JSON.stringify(listingDir.content), /read-test\.txt/);
    const processCall = await call('tools/call', {
      name: 'start_process', arguments: { command: 'pwd', timeout_ms: 10000, device_id: 'e2e-machine' }
    });
    assert.ok(!processCall.isError, 'start_process failed: ' + JSON.stringify(processCall).slice(0, 350));
    const forbidden = await call('tools/call', {
      name: 'read_file', arguments: { path: path.join(os.homedir(), '.ssh/id_ed25519'), device_id: 'e2e-machine' }
    });
    assert.equal(forbidden.isError, true, 'Sensitive path should be denied');
    assert.ok(!failures.length, failures.join('; '));
    console.log('Complete MCP chain: authenticated, device online, real list/read/write/process passed, sensitive path denied.');
  } finally {
    for (const p of procs) p.kill();
    await sleep(600);
    if (oldConfig) fs.writeFileSync(dcConfig, oldConfig);
    else fs.rmSync(dcConfig, { force: true });
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
