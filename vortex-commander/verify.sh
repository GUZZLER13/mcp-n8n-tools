#!/usr/bin/env bash
# Read-only verification of the local (not yet public) VORTEX gateway.
set -euo pipefail
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:8765';
const publicUrl = 'https://mcp.guzzler-bot.cloud';
async function verify() {
  const health = await fetch(base + '/health', { signal: AbortSignal.timeout(6000) });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  const unauthed = await fetch(base + '/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}',
    signal: AbortSignal.timeout(6000)
  });
  assert.equal(unauthed.status, 401);
  assert.match(unauthed.headers.get('www-authenticate') || '', /resource_metadata=/);
  const pr = await (await fetch(base + '/.well-known/oauth-protected-resource')).json();
  assert.equal(pr.resource, publicUrl + '/mcp');
  assert.ok(pr.authorization_servers.includes(publicUrl));
  const as = await (await fetch(base + '/.well-known/oauth-authorization-server')).json();
  assert.equal(as.issuer, publicUrl);
  assert.equal(as.authorization_endpoint, publicUrl + '/authorize');
  assert.equal(as.token_endpoint, publicUrl + '/token');
  assert.ok(as.code_challenge_methods_supported.includes('S256'));
  console.log('OK: local health, unauthenticated MCP denied, OAuth discovery and PKCE.');
  console.log('No secrets read or modified. Real ChatGPT connection still pending.');
}
verify().catch(e => { console.error('Local gateway verification failed: ' + e.message); process.exitCode = 1; });
NODE
