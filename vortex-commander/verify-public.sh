#!/usr/bin/env bash
# Only AFTER validated Caddy cutover. No secrets and no write operations.
set -euo pipefail
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
const origin = 'https://mcp.guzzler-bot.cloud';
const request = (path, opt = {}) => fetch(origin + path, {
  redirect: 'manual', signal: AbortSignal.timeout(10000), ...opt
});
async function verify() {
  const health = await request('/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  const unauthorized = await request('/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
  });
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers.get('www-authenticate') || '', /resource_metadata=/);
  const meta = await request('/.well-known/oauth-protected-resource');
  assert.equal(meta.status, 200);
  assert.equal((await meta.json()).resource, origin + '/mcp');
  const auth = await request('/.well-known/oauth-authorization-server');
  assert.equal(auth.status, 200);
  const data = await auth.json();
  assert.equal(data.issuer, origin);
  assert.equal(data.registration_endpoint, origin + '/register');
  assert.equal(data.token_endpoint, origin + '/token');
  assert.ok(data.code_challenge_methods_supported.includes('S256'));
  for (const path of ['/admin/', '/admin/setup', '/api/devices']) {
    const response = await request(path);
    assert.ok([401,403,404].includes(response.status),
      'Sensitive endpoint is public or redirected: ' + path + ' HTTP ' + response.status);
  }
  console.log('OK: HTTPS OAuth metadata, unauthenticated MCP denied and admin API blocked.');
  console.log('Real ChatGPT authorization and device calls still require manual testing.');
}
verify().catch(e => { console.error('Public gateway verification failed: ' + e.message); process.exitCode = 1; });
NODE
