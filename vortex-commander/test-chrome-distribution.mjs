// Runs only on an isolated CI runner after npm has preinstalled the exact
// chrome-devtools-mcp@1.13.0 package. No network or browser profile used by the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';

const root = process.env.VORTEX_BROWSER_STAGED_PACKAGE;
if (!root || !path.isAbsolute(root)) throw Error('VORTEX_BROWSER_STAGED_PACKAGE must be absolute');
const cli = path.join(root, 'out', 'Default', 'gen', 'src', 'bin', 'chrome-devtools-mcp.js');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('published npm archive includes the pinned direct entry point', () => {
  assert.equal(manifest.name, 'chrome-devtools-mcp');
  assert.equal(manifest.version, '1.13.0');
  assert.equal(manifest.bin['chrome-devtools-mcp'], './out/Default/gen/src/bin/chrome-devtools-mcp.js');
  assert.ok(fs.statSync(cli).isFile());
});

test('preinstalled CLI works without npx/npm or remote Chrome startup', () => {
  const output = spawnSync(process.execPath, [cli, '--help'], {
    encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024,
    env: {PATH: process.env.PATH || '/usr/bin:/bin', HOME: process.env.HOME || '/tmp'},
  });
  assert.equal(output.status, 0, output.stderr.slice(0, 1000));
  const help = output.stdout + output.stderr;
  for (const key of ['headless', 'isolated', 'executablePath', 'userDataDir']) {
    assert.match(help, new RegExp(key), 'Missing Chrome option ' + key);
  }
  // The CLI renders camelCase option names without dashes in --help.
  const normalizedHelp = help.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const key of ['javascriptEvaluation', 'redactNetworkHeaders', 'usageStatistics', 'performanceCrux']) {
    assert.ok(normalizedHelp.includes(key.toLowerCase()), 'Missing protection option ' + key);
  }
});

test('actual CLI argument parser enables redaction and disables JavaScript evaluation', async () => {
  const parserPath = path.join(root, 'out', 'Default', 'gen', 'src', 'config', 'ConfigParser.js');
  assert.ok(fs.statSync(parserPath).isFile(), 'Published CLI parser must be available');
  const {ConfigParser} = await import(pathToFileURL(parserPath).href);
  const options = new ConfigParser('1.13.0', [
    process.execPath, cli,
    '--headless', '--isolated', '--executablePath=/usr/bin/chromium',
    '--no-javascript-evaluation', '--no-file-navigations', '--redact-network-headers',
    '--no-usage-statistics', '--no-performance-crux',
  ], {...process.env, HOME: process.env.HOME || '/tmp'}, false).parse();
  assert.equal(options.headless, true);
  assert.equal(options.isolated, true);
  assert.equal(options.executablePath, '/usr/bin/chromium');
  assert.equal(options.javascriptEvaluation, false);
  assert.equal(options.fileNavigations, false);
  assert.equal(options.redactNetworkHeaders, true);
  assert.equal(options.usageStatistics, false);
  assert.equal(options.performanceCrux, false);
});

test('actual CLI parser recognizes dedicated persistent profile option', async () => {
  const parserPath = path.join(root, 'out', 'Default', 'gen', 'src', 'config', 'ConfigParser.js');
  const {ConfigParser} = await import(pathToFileURL(parserPath).href);
  const profile = '/tmp/vortex-chrome-ci-isolated-profile';
  const opts = new ConfigParser('1.13.0', [
    process.execPath, cli, '--headless', '--user-data-dir=' + profile,
  ], {...process.env, HOME: process.env.HOME || '/tmp'}, false).parse();
  assert.equal(opts.userDataDir, profile);
  assert.equal(opts.headless, true);
});


test('real pinned MCP server answers initialization and tool discovery over stdio', {timeout: 20000}, async (t) => {
  // No Chrome/browser is launched: only MCP handshake and tools/list are sent.
  const child = spawn(process.execPath, [
    cli, '--headless', '--isolated', '--executablePath=/usr/bin/chromium',
    '--no-javascript-evaluation', '--no-file-navigations',
    '--redact-network-headers', '--no-usage-statistics', '--no-performance-crux',
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH || '/usr/bin:/bin',
      HOME: process.env.HOME || '/tmp',
      NO_COLOR: '1',
    },
  });
  t.after(() => {
    child.stdin.destroy();
    child.kill('SIGTERM');
  });
  let buffer = '';
  let stderr = '';
  const pending = new Map();
  child.stderr.on('data', chunk => {
    stderr = (stderr + chunk.toString('utf8')).slice(-2000);
  });
  child.stdout.on('data', chunk => {
    buffer += chunk.toString('utf8');
    let end;
    while ((end = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      let reply;
      try { reply = JSON.parse(line); } catch { continue; }
      if (!Number.isSafeInteger(reply.id)) continue;
      const request = pending.get(reply.id);
      if (!request) continue;
      pending.delete(reply.id);
      clearTimeout(request.timer);
      if (reply.error) request.reject(new Error(JSON.stringify(reply.error)));
      else request.resolve(reply.result);
    }
  });
  child.on('error', error => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  });
  child.on('exit', (code, signal) => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('Chrome MCP exited ' + (code ?? signal) + ': ' + stderr));
    }
    pending.clear();
  });
  const call = (id, method, params) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('MCP ' + method + ' timed out: ' + stderr));
    }, 12000);
    pending.set(id, {resolve, reject, timer});
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id, method, params,
    }) + '\n');
  });
  const init = await call(1, 'initialize', {
    protocolVersion: '2025-03-26', capabilities: {},
    clientInfo: {name: 'vortex-browser-ci-smoke', version: '1.0.0'},
  });
  assert.ok(init?.serverInfo?.name, 'Real Chrome MCP server identification missing');
  child.stdin.write(JSON.stringify({
    jsonrpc: '2.0', method: 'notifications/initialized',
  }) + '\n');
  const available = await call(2, 'tools/list', {});
  assert.ok(Array.isArray(available?.tools), 'Real MCP tools/list response missing');
  const names = available.tools.map(tool => tool.name);
  assert.ok(names.includes('list_pages'), 'Navigation discovery unavailable');
  assert.ok(names.includes('new_page'), 'Navigation command unavailable');
  assert.ok(!names.includes('evaluate_script'), 'Unsafe script evaluation must be absent');
});
