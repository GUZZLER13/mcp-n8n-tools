// Regression contracts for the pinned upstream Chrome backend overlay.
// Run after patch-upstream.mjs on a temporary upstream checkout.
// No browser, network request, account or production service is started.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(process.cwd(), 'upstream', 'agent');
const { CATALOG, resolveBackend } = await import(pathToFileURL(path.join(root, 'backends.js')).href);
const { loadPolicy, check } = await import(pathToFileURL(path.join(root, 'policy.js')).href);
const spec = (params = {}) => ({ template: 'chrome-devtools', params });

test('only approved Chrome and RACINES MCP templates are offered', () => {
  assert.deepEqual(Object.keys(CATALOG), ['racines', 'chrome-devtools']);
  assert.equal(CATALOG['chrome-devtools'].prefix, 'chrome_');
  assert.ok(CATALOG['chrome-devtools'].default_disabled.includes('evaluate_script'));
  assert.ok(CATALOG['chrome-devtools'].default_disabled.includes('upload_file'));
  assert.throws(() => resolveBackend({ template: 'playwright' }, {}), /unknown template/);
});

test('default Chrome session is disposable and package version is fixed', () => {
  const backend = resolveBackend(spec(), {});
  assert.deepEqual(backend.command, [
    'npx', '-y', 'chrome-devtools-mcp@1.13.0', '--isolated',
    '--no-javascript-evaluation', '--redact-network-headers',
    '--no-usage-statistics', '--no-performance-crux'
  ]);
  assert.ok(!backend.command.some(arg => /autoConnect|browserUrl|wsEndpoint/i.test(arg)));
});

test('persistent session uses dedicated per-account local profile, not the personal Chrome profile', () => {
  const backend = resolveBackend(spec({ persistent: true, headless: true }), {});
  const dedicated = path.join(os.homedir(), '.local', 'share', 'vortex-commander', 'chrome-profile');
  assert.deepEqual(backend.command, [
    'npx', '-y', 'chrome-devtools-mcp@1.13.0',
    '--user-data-dir=' + dedicated,
    '--headless', '--no-javascript-evaluation', '--redact-network-headers',
    '--no-usage-statistics', '--no-performance-crux'
  ]);
  assert.ok(!backend.command.includes('--isolated'));
});

test('unknown autoConnect input cannot activate attachment to personal Chrome', () => {
  const backend = resolveBackend(spec({ autoConnect: true }), {});
  assert.ok(backend.command.includes('--isolated'));
  assert.ok(!backend.command.includes('--autoConnect'));
  assert.ok(backend.command.includes('--redact-network-headers'));
  assert.ok(backend.command.includes('--no-javascript-evaluation'));
  assert.ok(!CATALOG['chrome-devtools'].params.some(p => p.key === 'autoConnect'));
});

test('existing device policy denies direct access to saved browser cookies', () => {
  const policy = loadPolicy(path.join(os.tmpdir(), 'vortex-nonexistent-policy-test.json'));
  const cookies = path.join(os.homedir(), '.local', 'share', 'vortex-commander', 'chrome-profile', 'Default', 'Cookies');
  assert.match(check(policy, 'read_file', { path: cookies }), /blocked location/);
  assert.match(check(policy, 'write_file', { path: cookies }), /blocked location/);
  assert.equal(check(policy, 'read_file', { path: path.join(os.homedir(), 'note.txt') }), null);
});

test('RACINES cannot start through the general-purpose VORTEX agent', () => {
  const config = { template: 'racines', name: 'racines', params: {} };
  assert.throws(() => resolveBackend(config, {}),
    /RACINES backend requires (a Linux service host|dedicated isolated reader)/);
  // These contracts are applied to the actual pinned upstream agent by the
  // overlay. They prevent any shell, file or browser backend in reader-only mode.
  const agent = fs.readFileSync(path.join(root, 'agent.js'), 'utf8');
  assert.match(agent, /if \(!RACINES_READER_ONLY && !VORTEX_BROWSER_ONLY\) await startBuiltin\(\);/);
  assert.match(agent, /if \(RACINES_READER_ONLY\) desired = desired\.filter\(/);
  assert.match(agent, /os\.userInfo\(\)\.username !== 'vortex-racines'/);
  assert.match(agent, /process\.getuid\?\.\(\) === 0/);
});

test('dedicated browser-only agent exposes no Desktop Commander and cannot use RACINES', () => {
  const agent = fs.readFileSync(path.join(root, 'agent.js'), 'utf8');
  assert.match(agent, /VORTEX_BROWSER_ONLY = process\.env\.VORTEX_BROWSER_ONLY/);
  assert.match(agent, /username !== 'vortex-browser'/);
  assert.match(agent, /if \(VORTEX_BROWSER_ONLY\) desired = desired\.filter\(/);
  assert.match(agent, /d\?\.name === "chrome-devtools" && d\?\.template === "chrome-devtools"/);
  assert.match(agent, /if \(!RACINES_READER_ONLY && !VORTEX_BROWSER_ONLY\) await startBuiltin\(\);/);
  assert.match(agent, /process\.getuid\?\.\(\) === 0/);
});

test('Debian Chromium is a fixed opt-in executable with fail-closed availability', () => {
  const chromiumInstalled = process.platform === 'linux' && fs.existsSync('/usr/bin/chromium');
  const config = spec({ debianChromium: true, headless: true });
  if (!chromiumInstalled) {
    assert.throws(() => resolveBackend(config, {}), /Debian Chromium requires installed/);
  } else {
    const b = resolveBackend(config, {});
    assert.ok(b.command.includes('--executablePath=/usr/bin/chromium'));
    assert.ok(b.command.includes('--headless'));
    assert.ok(!b.command.some(x => /^--no-sandbox/.test(x)));
  }
  const ordinary = resolveBackend(spec(), {});
  assert.ok(!ordinary.command.some(x => x.startsWith('--executablePath=')));
  const param = CATALOG['chrome-devtools'].params.find(x => x.key === 'debianChromium');
  assert.equal(param?.default, false);
});
