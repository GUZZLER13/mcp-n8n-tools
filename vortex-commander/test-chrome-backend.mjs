// Regression contracts for the pinned upstream Chrome backend overlay.
// Run after patch-upstream.mjs on a temporary upstream checkout.
// No browser, network request, account or production service is started.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(process.cwd(), 'upstream', 'agent');
const { CATALOG, resolveBackend } = await import(pathToFileURL(path.join(root, 'backends.js')).href);
const { loadPolicy, check } = await import(pathToFileURL(path.join(root, 'policy.js')).href);
const spec = (params = {}) => ({ template: 'chrome-devtools', params });

test('only Chrome DevTools is offered as a browser template', () => {
  assert.deepEqual(Object.keys(CATALOG), ['chrome-devtools']);
  assert.equal(CATALOG['chrome-devtools'].prefix, 'chrome_');
  assert.ok(CATALOG['chrome-devtools'].default_disabled.includes('evaluate_script'));
  assert.ok(CATALOG['chrome-devtools'].default_disabled.includes('upload_file'));
  assert.throws(() => resolveBackend({ template: 'playwright' }, {}), /unknown template/);
});

test('default Chrome session is disposable and package version is fixed', () => {
  const backend = resolveBackend(spec(), {});
  assert.deepEqual(backend.command, [
    'npx', '-y', 'chrome-devtools-mcp@1.13.0', '--isolated'
  ]);
  assert.ok(!backend.command.some(arg => /autoConnect|browserUrl|wsEndpoint/i.test(arg)));
});

test('persistent session uses dedicated per-account local profile, not the personal Chrome profile', () => {
  const backend = resolveBackend(spec({ persistent: true, headless: true }), {});
  const dedicated = path.join(os.homedir(), '.local', 'share', 'vortex-commander', 'chrome-profile');
  assert.deepEqual(backend.command, [
    'npx', '-y', 'chrome-devtools-mcp@1.13.0',
    '--user-data-dir=' + dedicated,
    '--headless'
  ]);
  assert.ok(!backend.command.includes('--isolated'));
});

test('unknown autoConnect input cannot activate attachment to personal Chrome', () => {
  const backend = resolveBackend(spec({ autoConnect: true }), {});
  assert.ok(backend.command.includes('--isolated'));
  assert.ok(!backend.command.includes('--autoConnect'));
  assert.ok(!CATALOG['chrome-devtools'].params.some(p => p.key === 'autoConnect'));
});

test('existing device policy denies direct access to saved browser cookies', () => {
  const policy = loadPolicy(path.join(os.tmpdir(), 'vortex-nonexistent-policy-test.json'));
  const cookies = path.join(os.homedir(), '.local', 'share', 'vortex-commander', 'chrome-profile', 'Default', 'Cookies');
  assert.match(check(policy, 'read_file', { path: cookies }), /blocked location/);
  assert.match(check(policy, 'write_file', { path: cookies }), /blocked location/);
  assert.equal(check(policy, 'read_file', { path: path.join(os.homedir(), 'note.txt') }), null);
});
