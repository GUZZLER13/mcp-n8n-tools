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
import crypto from 'node:crypto';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// Desktop Commander limits file access to the OS user's home by default.
const home = fs.mkdtempSync(path.join(os.homedir(), '.vortex-e2e-'));
fs.chmodSync(home, 0o700);
const dbPath = path.join(home, 'gateway.sqlite');
const rootBackend = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'VortexCommander', 'backend')
  : path.join(os.homedir(), '.local', 'share', 'vortex-commander', 'backend');
const entry = path.join(rootBackend, 'node_modules', '@wonderwhy-er', 'desktop-commander', 'dist', 'index.js');
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
    start(process.execPath, ['gateway/server.js', '--host', '127.0.0.1', '--port', String(port), '--db', dbPath, '--public-url', 'https://mcp.example.com']);
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
    console.log('MCP tool surface (' + names.length + '): ' + names.join(', '));
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
    const edited = await call('tools/call', {
      name: 'edit_block',
      arguments: {
        file_path: outputPath,
        old_string: 'vortex-write-marker-2026',
        new_string: 'vortex-edited-marker-2026',
        device_id: 'e2e-machine'
      }
    });
    assert.ok(!edited.isError, 'edit_block failed: ' + JSON.stringify(edited).slice(0, 350));
    assert.equal(fs.readFileSync(outputPath, 'utf8'), 'vortex-edited-marker-2026\n');
    const searched = await call('tools/call', {
      name: 'start_search',
      arguments: {
        path: home, pattern: 'vortex-edited-marker-2026',
        searchType: 'content', literalSearch: true, filePattern: '*.txt',
        timeout_ms: 10000, device_id: 'e2e-machine'
      }
    });
    assert.ok(!searched.isError, 'start_search failed: ' + JSON.stringify(searched).slice(0, 350));

    const listingDir = await call('tools/call', {
      name: 'list_directory', arguments: { path: home, device_id: 'e2e-machine' }
    });
    assert.ok(!listingDir.isError, 'list_directory failed: ' + JSON.stringify(listingDir).slice(0, 350));
    assert.match(JSON.stringify(listingDir.content), /read-test\.txt/);
    const processCall = await call('tools/call', {
      name: 'start_process', arguments: { command: process.platform === 'win32' ? 'whoami' : 'pwd', timeout_ms: 10000, device_id: 'e2e-machine' }
    });
    assert.ok(!processCall.isError, 'start_process failed: ' + JSON.stringify(processCall).slice(0, 350));

    // Read-only parallel checks: one network request, each subcall reuses the
    // authenticated relay and device policy. No arbitrary shell commands.
    const quick = await call('tools/call', {
      name: 'quick_checks', arguments: { device_id: 'e2e-machine', checks: [
        { type: 'get_file_info', path: inputPath },
        { type: 'list_directory', path: home }
      ] }
    });
    assert.notEqual(quick.isError, true, 'quick_checks should succeed');
    const quickResults = JSON.parse(quick.content[0].text);
    assert.equal(quickResults.results.length, 2);
    assert.ok(quickResults.results.every(x => x.ok === true));
    assert.ok(quickResults.results.every(x => x.elapsed_ms >= 0));
    assert.ok(quickResults.results.every(x => (x.preview || '').length <= 400));

    // Reject the whole malformed batch; never expose arbitrary command strings.
    const badQuick = await call('tools/call', {
      name: 'quick_checks', arguments: { device_id: 'e2e-machine', checks: [
        { type: 'whoami', command: 'rm -rf /' }
      ] }
    });
    assert.equal(badQuick.isError, true, 'Arbitrary command arguments must be rejected');
    assert.match(JSON.stringify(badQuick.structuredContent || badQuick.content), /INVALID_ARGUMENT/);
    const tooMany = await call('tools/call', {
      name: 'quick_checks', arguments: { device_id: 'e2e-machine',
        checks: Array.from({ length: 5 }, () => ({ type: 'pwd' })) }
    });
    assert.equal(tooMany.isError, true, 'More than 4 checks must be rejected');

    // A denied location still fails when requested inside a batch.
    const forbiddenQuick = await call('tools/call', {
      name: 'quick_checks', arguments: { device_id: 'e2e-machine', checks: [
        { type: 'get_file_info', path: path.join(os.homedir(), '.ssh/id_ed25519') }
      ] }
    });
    const deniedResult = JSON.parse(forbiddenQuick.content[0].text).results[0];
    assert.equal(deniedResult.ok, false, 'Batch must not bypass sensitive path policy');
    assert.equal(deniedResult.error, 'POLICY_DENIED');


    // Reproduce the ChatGPT custom MCP OAuth flow: discovery -> dynamic
    // registration -> owner consent -> PKCE exchange -> authenticated MCP
    // session -> real device write -> refresh rotation. Test secrets are
    // temporary, ephemeral and never logged or committed.
    const issuer = 'https://mcp.example.com';
    const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect';
    const metadata = await (await fetch(base + '/.well-known/oauth-protected-resource')).json();
    assert.equal(metadata.resource, issuer + '/mcp');
    assert.ok(metadata.authorization_servers.includes(issuer));
    const discovery = await (await fetch(base + '/.well-known/oauth-authorization-server')).json();
    assert.equal(discovery.issuer, issuer);
    assert.equal(discovery.token_endpoint, issuer + '/token');
    assert.ok(discovery.scopes_supported.includes('offline_access'), 'OAuth must advertise refresh access to ChatGPT');
    const registration = await fetch(base + '/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'ChatGPT VORTEX integration test', redirect_uris: [redirect] })
    });
    assert.equal(registration.status, 201, 'OAuth dynamic registration must succeed');
    const oauthClient = await registration.json();
    assert.ok(oauthClient.client_id, 'OAuth client registration id missing');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const authParams = new URLSearchParams({
      response_type: 'code', client_id: oauthClient.client_id,
      redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256',
      state: 'vortex-e2e-state', resource: issuer + '/mcp'
    });
    const ownerToken = extract(admin('client-create', 'vortex-owner', '--admin'), 'client_token');
    const consent = await fetch(base + '/authorize', {
      method: 'POST', redirect: 'manual',
      body: new URLSearchParams({ ...Object.fromEntries(authParams), owner_token: ownerToken, action: 'approve' })
    });
    assert.equal(consent.status, 302, 'Desktop OAuth consent did not redirect');
    const callback = new URL(consent.headers.get('location'));
    assert.equal(callback.origin + callback.pathname, redirect);
    assert.equal(callback.searchParams.get('state'), 'vortex-e2e-state');
    assert.equal(callback.searchParams.get('iss'), issuer);
    const grant = await fetch(base + '/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code', client_id: oauthClient.client_id,
        code: callback.searchParams.get('code'), redirect_uri: redirect, code_verifier: verifier
      })
    });
    assert.equal(grant.status, 200, 'OAuth code and PKCE exchange failed');
    const oauthTokens = await grant.json();
    assert.ok(oauthTokens.access_token && oauthTokens.refresh_token);
    let oauthSession = null;
    async function oauthRpc(method, params, accessToken = oauthTokens.access_token) {
      const response = await fetch(base + '/mcp', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + accessToken,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...(oauthSession ? { 'mcp-session-id': oauthSession } : {})
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 54, method, params })
      });
      assert.equal(response.status, 200, 'OAuth-authenticated MCP HTTP request failed');
      oauthSession = response.headers.get('mcp-session-id') || oauthSession;
      const json = await response.json();
      assert.ok(!json.error, 'OAuth MCP JSON-RPC error: ' + JSON.stringify(json.error));
      return json.result;
    }
    await oauthRpc('initialize', {
      protocolVersion: '2025-06-18', capabilities: {},
      clientInfo: { name: 'ChatGPT-like test client', version: '1.0' }
    });
    const oauthTools = await oauthRpc('tools/list', {});
    assert.ok(oauthTools.tools.some(tool => tool.name === 'write_file'));
    const oauthOutput = path.join(home, 'oauth-write-test.txt');
    const oauthWrite = await oauthRpc('tools/call', {
      name: 'write_file',
      arguments: { path: oauthOutput, content: 'vortex-oauth-write-marker\n', device_id: 'e2e-machine' }
    });
    assert.ok(!oauthWrite.isError, 'OAuth relay to write_file failed: ' + JSON.stringify(oauthWrite).slice(0, 400));
    assert.equal(fs.readFileSync(oauthOutput, 'utf8'), 'vortex-oauth-write-marker\n');
    const refreshed = await fetch(base + '/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: oauthClient.client_id,
        refresh_token: oauthTokens.refresh_token
      })
    });
    assert.equal(refreshed.status, 200, 'OAuth refresh grant failed');
    const rotated = await refreshed.json();
    assert.notEqual(rotated.refresh_token, oauthTokens.refresh_token, 'Refresh token was not rotated');
    const replay = await fetch(base + '/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: oauthClient.client_id,
        refresh_token: oauthTokens.refresh_token
      })
    });
    assert.equal(replay.status, 400, 'Replayed refresh token should fail');
    console.log('OAuth ChatGPT-like flow passed: discovery, PKCE, consent, real MCP file write and refresh rotation.');

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
    // Windows SQLite holds a DB handle briefly after child exit (EBUSY).
    // CI runners are ephemeral; leaving a temp test dir is preferable to a false
    // failure in this integration test. Linux cleans up normally.
    if (process.platform !== 'win32') fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
