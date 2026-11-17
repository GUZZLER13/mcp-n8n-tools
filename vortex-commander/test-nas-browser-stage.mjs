// Read-only regression checks for gated NAS Chromium staging.
// No package install, privilege escalation, account change, or live SQLite access.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = path.resolve('vortex-commander/nas-browser-stage.sh');
const source = fs.readFileSync(script, 'utf8');
const stage = (args = []) => spawnSync('bash', [script, ...args], {
  encoding: 'utf8', timeout: 10000, env: { PATH: '/usr/bin:/bin' }
});

test('staging shell script parses', () => {
  const result = spawnSync('bash', ['-n', script], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
});

test('untrusted NAS Node is hashed, never executed before a root-owned copy is verified', () => {
  const start = source.indexOf('check_host() {');
  const end = source.indexOf('check_receipt() {', start);
  const check = source.slice(start, end);
  assert.ok(end > start);
  assert.ok(check.includes('sha256sum "$SOURCE_NODE"'));
  assert.ok(check.includes('[ ! -L "$SOURCE_NODE" ]'));
  assert.ok(!check.includes('"$SOURCE_NODE" --version'));
  const copy = source.indexOf('install -o root -g root -m 0755 "$SOURCE_NODE" "$PREFIX/bin/node"');
  const postCopyHash = source.indexOf('sha256sum "$PREFIX/bin/node"', copy);
  const version = source.indexOf('"$PREFIX/bin/node" --version', copy);
  assert.ok(copy > 0 && postCopyHash > copy && version > postCopyHash,
    'Node can only execute after the root-owned copy has been fingerprinted');
  assert.ok(source.includes('Copied Node runtime is not a trusted, root-owned binary'));
});

test('check-only path precedes all mutations and reports no gateway changes', () => {
  assert.ok(source.indexOf('  --check)') > 0);
  assert.ok(source.indexOf('  --apply)') > source.indexOf('  --check)'));
  assert.match(source, /PRODUCTION_CHANGES=none/);
  assert.match(source, /STAGED_NOT_ACTIVATED=yes/);
  assert.doesNotMatch(source, /systemctl (?:restart|stop)|service (?:restart|stop)|--no-sandbox|rm -rf/);
});

test('apply requires local root and a restore receipt before any installation', () => {
  const applyAt = source.indexOf('  --apply)');
  const gateAt = source.indexOf("    check_receipt \"$3\"", applyAt);
  const rootAt = source.indexOf("    [ \"$(id -u)\" -eq 0 ]", applyAt);
  const pkgAt = source.indexOf('/usr/bin/apt-get install -y --no-install-recommends chromium', applyAt);
  const npmAt = source.indexOf('/usr/bin/npm install --prefix "$PREFIX"', applyAt);
  assert.ok(rootAt > applyAt && gateAt > rootAt);
  assert.ok(pkgAt > gateAt && npmAt > gateAt);
  assert.match(source, /--independent-copy-confirmed/);
  assert.match(source, /STAGING_REFUSED/);
});

test('rejects untrusted or incomplete existing staged trees without npm overwrite', () => {
  assert.match(source, /ALREADY_STAGED_NOT_ACTIVATED=yes/);
  assert.match(source, /Existing staging lacks a complete pinned MCP package/);
  assert.match(source, /Existing Chrome MCP has unexpected version/);
  assert.ok(source.includes('find "$PREFIX" -xdev'), 'full tree must be checked for untrusted entries');
  assert.match(source, /-perm \/022/);
  assert.match(source, /sha256sum/);
  assert.match(source, /chrome-devtools-mcp@1\.13\.0/);
  assert.match(source, /--no-bin-links/);
  assert.match(source, /Existing staging lacks its dedicated user/);
  assert.match(source, /Existing browser home is missing or unsafe/);
});

test('never initiates staging on a different OS', { skip: process.platform !== 'linux' }, () => {
  const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
  const isExpected = /^ID=debian$/m.test(osRelease) && /^VERSION_ID="?13"?$/m.test(osRelease);
  if (isExpected) return;
  const result = stage(['--apply', '--receipt', '/nonexistent/verification.json', '--independent-copy-confirmed']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /STAGING_REFUSED:/);
});

test('systemd browser agent service remains unprivileged, isolated and not automatically activated', () => {
  const unit = fs.readFileSync(path.resolve('vortex-commander/vortex-browser-agent.service.in'), 'utf8');
  assert.match(unit, /^User=vortex-browser$/m);
  assert.match(unit, /^Group=vortex-browser$/m);
  assert.match(unit, /^Environment=VORTEX_BROWSER_ONLY=true$/m);
  assert.match(unit, /^NoNewPrivileges=true$/m);
  assert.match(unit, /^ProtectSystem=strict$/m);
  assert.match(unit, /^ProtectHome=true$/m);
  assert.match(unit, /^ReadWritePaths=\/var\/lib\/vortex-browser$/m);
  assert.match(unit, /^CapabilityBoundingSet=$/m);
  assert.match(unit, /^ConditionPathExists=\/var\/lib\/vortex-browser\/\.config\/remote-mcp\/device\.json$/m);
  assert.match(unit, /^ExecStart=\/opt\/vortex-browser-mcp\/bin\/node /m);
  assert.match(unit, /^MemoryMax=4G$/m);
  assert.doesNotMatch(unit, /^(?:ExecStartPre=.*(?:npm install|chown|useradd)|User=root|Environment=.*(?:SECRET|TOKEN))$/mi);
  assert.doesNotMatch(source, /systemctl (?:enable|start|restart)/);
});

test('separate browser-agent archive stage keeps backup gate, preserves gateway, and never starts a service', () => {
  const install = fs.readFileSync(path.resolve('vortex-commander/nas-browser-agent-stage.sh'), 'utf8');
  const syntax = spawnSync('bash', ['-n', 'vortex-commander/nas-browser-agent-stage.sh'], {encoding:'utf8', timeout: 10000});
  assert.equal(syntax.status, 0, syntax.stderr);
  const rootCheck = install.indexOf('[ "$(id -u)" -eq 0 ]');
  const receipt = install.indexOf('receipt_ok "$7"');
  const runtime = install.indexOf('trusted_node', rootCheck);
  const digest = install.indexOf('sha256sum "$bundle"', rootCheck);
  const extract = install.indexOf('tar --no-same-owner --no-same-permissions -xzf', rootCheck);
  const move = install.indexOf('mv -T "$stage/payload" "$PREFIX"', rootCheck);
  assert.ok(rootCheck > 0 && receipt > rootCheck && runtime > receipt);
  assert.ok(digest > runtime && extract > digest && move > extract);
  assert.ok(install.includes('NO_SERVICE_STARTED=yes'));
  assert.ok(install.includes('NO_DEVICE_PAIRED=yes'));
  assert.ok(install.includes('An existing browser agent must not be overwritten'));
  assert.ok(install.includes("['-','d'].includes(line[0])"));
  assert.ok(install.includes("agent\\.js|backends\\.js|policy\\.js"));
  assert.doesNotMatch(install, /systemctl\s+(?:enable|start|restart)|--no-sandbox|device_secret\s*=/);
});
