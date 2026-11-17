// VORTEX Commander deterministic adaptation of pinned SelfHostDesktopMCP.
// Applies Windows filesystem policy fixes, safe local backend defaults, and
// localhost routing on the VPS. Fail closed if upstream source is unexpected.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kitDir = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] && path.resolve(process.argv[2]);
if (!root || !fs.existsSync(path.join(root, 'agent', 'agent.js'))) {
  throw new Error('Usage: node patch-upstream.mjs /path/to/pinned-SelfHostDesktopMCP');
}
const get = rel => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const put = (rel, value) => fs.writeFileSync(path.join(root, rel), value, 'utf8');
function exact(src, needle, replacement, count = 1) {
  const n = src.split(needle).length - 1;
  if (n !== count) {
    throw new Error('Unexpected upstream: expected ' + count + ' matches, got ' + n + ' for ' + needle.slice(0, 75));
  }
  return src.split(needle).join(replacement);
}

let policy = get('agent/policy.js');
const sourceLine = policy.split('\n').find(x => x.includes('const text = cmd.replace('));
if (!sourceLine) throw new Error('Cannot find command-path policy');
const expansion = '    const expandedCommand = cmd.replace(/%USERPROFILE%|\\$env:(?:USERPROFILE|HOME)/gi, home);';
const modifiedLine = sourceLine.replace('cmd.replace(', 'expandedCommand.replace(');
const normalized = '    const normalizedText = process.platform === "win32" ? text.replace(/\\//g, path.sep) : text;';
policy = exact(policy, sourceLine, [expansion, modifiedLine, normalized].join('\n'));
policy = exact(policy, 'CASE(text).includes', 'CASE(normalizedText).includes', 2);
// Browser profiles contain session cookies; deny direct file-tool reads of
// the dedicated directory. This is defense in depth, not a sandbox for shell.
policy = exact(policy,
  "'~/remote-mcp/secrets', '~/remote-mcp/remote-mcp.db'",
  "'~/remote-mcp/secrets', '~/remote-mcp/remote-mcp.db', '~/.local/share/vortex-commander/chrome-profile'");
put('agent/policy.js', policy);

// ChatGPT's OAuth integration relies on advertised offline refresh access.
// Upstream already issues and rotates refresh tokens, but omits offline_access
// from the RFC metadata. Advertise the existing behavior explicitly.
let oauthSource = get('gateway/oauth.js');
oauthSource = exact(oauthSource,
  "scopes_supported: ['mcp'], authorization_response_iss_parameter_supported: true,",
  "scopes_supported: ['mcp', 'offline_access'], authorization_response_iss_parameter_supported: true,");
oauthSource = exact(oauthSource,
  "refresh_token: refresh, scope: 'mcp'",
  "refresh_token: refresh, scope: 'mcp offline_access'");
put('gateway/oauth.js', oauthSource);

// Chrome DevTools is the single browser backend for guided archive research.
// Keep ephemeral browser profiles by default. An explicit opt-in uses an
// absolute per-user, per-device profile directory for repeatable persistence.
// Never share the personal Chrome profile or expose arbitrary browser flags.
let browserBackends = get('agent/backends.js');
browserBackends = exact(browserBackends,
  '// Catalog of MCP servers the gateway console may ask an agent to run.',
  "import os from 'node:os';\nimport path from 'node:path';\n\n" +
  '// Catalog of MCP servers the gateway console may ask an agent to run.');
browserBackends = exact(browserBackends,
  "params: [\n      { key: 'autoConnect', label: 'Use my running Chrome (--autoConnect): your real profile and logged-in sessions', type: 'boolean', default: false },\n      { key: 'headless', label: 'Headless (no visible window; ignored with autoConnect)', type: 'boolean', default: false },\n    ],\n    // --autoConnect attaches to an existing browser, so it replaces --isolated/--headless (which only apply to a browser it launches itself)\n    args: (p) => (p.autoConnect ? ['--autoConnect'] : ['--isolated', ...(p.headless ? ['--headless'] : [])]),",
  "params: [\n" +
  "      { key: 'headless', label: 'Headless (no visible window)', type: 'boolean', default: false },\n" +
  "      { key: 'persistent', label: 'Keep dedicated Chrome DevTools session on this device (opt-in)', type: 'boolean', default: false },\n" +
  "      { key: 'debianChromium', label: 'Use system Debian Chromium (Linux only)', type: 'boolean', default: false },\n" +
  "    ],\n" +
  "    args: (p) => [\n" +
  "      ...(p.debianChromium === true ? ['--executablePath=/usr/bin/chromium'] : []),\n" +
  "      ...(p.persistent ? [\`--user-data-dir=\${path.join(os.homedir(), '.local', 'share', 'vortex-commander', 'chrome-profile')}\`] : ['--isolated']),\n" +
  "      ...(p.headless ? ['--headless'] : []),\n" +
  "      '--no-javascript-evaluation', '--redact-network-headers',\n" +
  "      '--no-usage-statistics', '--no-performance-crux',\n" +
  "    ],");
browserBackends = exact(browserBackends,
  "  playwright: {\n    title: 'Playwright browser',\n    description: 'Browser automation by accessibility snapshot (navigate, click, type, screenshot). In-memory profile.',\n    package: '@playwright/mcp', prefix: 'playwright_',\n    params: [{ key: 'headless', label: 'Headless (no visible window)', type: 'boolean', default: false }],\n    args: (p) => ['--isolated', ...(p.headless ? ['--headless'] : [])],\n    default_disabled: ['browser_evaluate', 'browser_run_code', 'browser_file_upload'],\n  },\n",
  "");
browserBackends = exact(browserBackends,
  "return { name, command: ['npx', '-y', \`${t.package}@latest\`, ...t.args(p)], prefix: t.prefix, defaultDisabled: t.default_disabled };",
  "if (template === 'chrome-devtools' && p.debianChromium === true && (process.platform !== 'linux' || !fs.existsSync('/usr/bin/chromium'))) throw new Error('Debian Chromium requires installed /usr/bin/chromium on Linux');\n  " +
  "return { name, command: ['npx', '-y', 'chrome-devtools-mcp@1.13.0', ...t.args(p)], prefix: t.prefix, defaultDisabled: t.default_disabled };");
// Fixed RACINES reader backend: no arbitrary commands, no user-managed token.
browserBackends = exact(
  browserBackends,
  "import os from 'node:os';",
  "import os from 'node:os';\nimport fs from 'node:fs';\nimport { fileURLToPath } from 'node:url';"
);
browserBackends = exact(
  browserBackends,
  'export const CATALOG = {',
  "export const CATALOG = {\n" +
    "  racines: { title: 'RACINES (lecture seule)', description: 'Family research via private mTLS, no browser credentials', prefix: 'racines_', params: [], default_disabled: [] },"
);
browserBackends = exact(
  browserBackends,
  "  if (template === 'custom') {",
  "  if (template === 'racines') {\n" +
    "    if (name !== 'racines' || Object.keys(params).length) throw new Error('invalid RACINES options');\n" +
    "    if (process.platform !== 'linux') throw new Error('RACINES backend requires a Linux service host');\n" +
    "    if (process.env.VORTEX_RACINES_READER_ONLY !== 'true' || process.getuid?.() === 0 || os.userInfo().username !== 'vortex-racines') throw new Error('RACINES backend requires dedicated isolated reader');\n" +
    "    const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'racines-mcp.mjs');\n" +
    "    if (!fs.existsSync(script)) throw new Error('RACINES backend not installed');\n" +
    "    return { name: 'racines', command: [process.execPath, script], prefix: 'racines_', defaultDisabled: [] };\n" +
    "  }\n" +
    "  if (template === 'custom') {"
);
put('agent/backends.js', browserBackends);

// Keep upstream end-to-end regression coverage while replacing only its old
// catalog expectations; this overlay intentionally removes automatic access
// to personal Chrome and Playwright. On upstream drift fail closed.
let browserTests = get('test/backends.test.js');
browserTests = exact(browserTests, "'chrome-devtools-mcp@latest'", "'chrome-devtools-mcp@1.13.0'", 2);
browserTests = exact(browserTests,
  "assert.deepEqual(r.command, ['npx', '-y', 'chrome-devtools-mcp@1.13.0', '--isolated', '--headless']);",
  "assert.deepEqual(r.command, ['npx', '-y', 'chrome-devtools-mcp@1.13.0', '--isolated', '--headless', '--no-javascript-evaluation', '--redact-network-headers', '--no-usage-statistics', '--no-performance-crux']);");
browserTests = exact(browserTests,
  "assert.deepEqual(resolveBackend({ template: 'chrome-devtools', name: 'chrome-devtools', params: { autoConnect: true, headless: true } }, {}).command, ['npx', '-y', 'chrome-devtools-mcp@1.13.0', '--autoConnect']);",
  "assert.ok(resolveBackend({ template: 'chrome-devtools', name: 'chrome-devtools', params: { autoConnect: true, headless: true } }, {}).command.includes('--isolated'));" );
browserTests = exact(browserTests,
  "assert.deepEqual(resolveBackend({ template: 'chrome-devtools', name: 'chrome-devtools', params: {} }, {}).command.slice(3), ['--isolated'], 'defaults stay isolated');",
  "assert.ok(resolveBackend({ template: 'chrome-devtools', name: 'chrome-devtools', params: {} }, {}).command.includes('--isolated'), 'defaults stay isolated');");
browserTests = exact(browserTests,
  "assert.deepEqual(resolveBackend({ template: 'playwright', name: 'playwright', params: {} }, {}).command.slice(0, 3), ['npx', '-y', '@playwright/mcp@latest']);",
  "assert.throws(() => resolveBackend({ template: 'playwright', name: 'playwright', params: {} }, {}), /unknown template/);");
browserTests = exact(browserTests, "assert.ok(Object.keys(CATALOG).length >= 2);",
  "assert.deepEqual(Object.keys(CATALOG), ['racines', 'chrome-devtools']);");
put('test/backends.test.js', browserTests);

let agent = get('agent/agent.js');
// Reader-only mode is for a different, non-root OS identity and a separate
// paired VORTEX device. Never run Desktop Commander or Chrome in this mode.
agent = exact(agent,
  "const policy = loadPolicy(flag('policy', path.join(path.dirname(configPath), 'policy.json')));",
  "const RACINES_READER_ONLY = process.env.VORTEX_RACINES_READER_ONLY === 'true';\\n" +
  "const VORTEX_BROWSER_ONLY = process.env.VORTEX_BROWSER_ONLY === 'true';\\n" +
  "if (RACINES_READER_ONLY && (process.platform !== 'linux' || process.getuid?.() === 0 || os.userInfo().username !== 'vortex-racines')) {\\n" +
  "  throw Error('RACINES reader requires a dedicated unprivileged vortex-racines account');\\n" +
  "}\\n" +
  "if (VORTEX_BROWSER_ONLY && (process.platform !== 'linux' || process.getuid?.() === 0 || os.userInfo().username !== 'vortex-browser')) {\\n" +
  "  throw Error('VORTEX browser mode requires dedicated unprivileged vortex-browser account');\\n" +
  "}\\n" +
  "const policy = loadPolicy(flag('policy', path.join(path.dirname(configPath), 'policy.json')));"
);
agent = exact(agent,
  'async function reconcile(desired) {',
  'async function reconcile(desired) {\n  if (RACINES_READER_ONLY) desired = desired.filter(d => d?.name === "racines" && d?.template === "racines");\n  if (VORTEX_BROWSER_ONLY) desired = desired.filter(d => d?.name === "chrome-devtools" && d?.template === "chrome-devtools");'
);
agent = exact(agent, 'await startBuiltin();', 'if (!RACINES_READER_ONLY && !VORTEX_BROWSER_ONLY) await startBuiltin();');
// Never implicitly launch @latest; explicit pinned package setup is required.
agent = exact(agent,
  "desktop_commander: { command: ['npx', '-y', '@wonderwhy-er/desktop-commander@latest'] }",
  'desktop_commander: { command: [] }', 2);
agent = exact(agent,
  "const command = cfg.desktop_commander?.command ?? ['npx', '-y', '@wonderwhy-er/desktop-commander@latest'];",
  "const command = cfg.desktop_commander?.command;\n    if (!Array.isArray(command) || command.length < 2) throw new Error('Pinned Desktop Commander not configured: run agent/configure-backend.mjs');");
const envLine = agent.split('\n').find(x => x.startsWith('const PASS_ENV = '));
if (!envLine) throw new Error('Cannot find child process environment');
agent = exact(agent, envLine,
  "const PASS_ENV = ['DISPLAY','XAUTHORITY','WAYLAND_DISPLAY','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS','XDG_SESSION_TYPE','XDG_CURRENT_DESKTOP','LANG','LC_ALL','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','SystemRoot','WINDIR','HOMEDRIVE','HOMEPATH','ComSpec','PATHEXT'];");
// Keep Chrome calls sequential within this agent to prevent overlapping UI
// actions. Pace full navigations modestly to avoid accidental bursts;
// never retry challenges, forbidden pages or HTTP rate-limit responses.
agent = exact(agent,
  'const exposedTools = () => [...routes.values()].map((r) => r.tool);',
  'const exposedTools = () => [...routes.values()].map((r) => r.tool);\n' +
  'const BROWSER_NAV_GAP_MS = 2500;\n' +
  'let browserToolLane = Promise.resolve();\n' +
  'let lastBrowserNavStart = 0;\n' +
  'const callBrowserTool = (route, args, timeout) => {\n' +
  '  const run = async () => {\n' +
  '    if (["navigate_page", "new_page", "navigate_history"].includes(route.real)) {\n' +
  '      const delay = Math.max(0, lastBrowserNavStart + BROWSER_NAV_GAP_MS - Date.now());\n' +
  '      if (delay) await new Promise(resolve => setTimeout(resolve, delay));\n' +
  '      lastBrowserNavStart = Date.now();\n' +
  '    }\n' +
  '    return route.slot.conn.callTool(route.real, args, timeout);\n' +
  '  };\n' +
  '  const pending = browserToolLane.then(run, run);\n' +
  '  browserToolLane = pending.then(() => {}, () => {});\n' +
  '  return pending;\n' +
  '};');
agent = exact(agent,
  'const result = await route.slot.conn.callTool(route.real, args, Number.isFinite(t) ? t + 4000 : 60_000);',
  'const timeout = Number.isFinite(t) ? t + 4000 : 60_000;\n' +
  '        const result = await (route.slot.name === "chrome-devtools"\n' +
  '          ? callBrowserTool(route, args, timeout)\n' +
  '          : route.slot.conn.callTool(route.real, args, timeout));');
put('agent/agent.js', agent);

// The gateway and VPS agent initially talk only over localhost. We do not
// send device secrets to an old public bridge at the same hostname.
let linux = get('deploy/install-linux.sh');
linux = exact(linux, 'npm install --omit=dev --silent',
  'npm ci --omit=dev --ignore-scripts --no-audit --no-fund --silent');
const initLine = linux.split('\n').find(x => x.includes('node agent/agent.js init --gateway'));
if (!initLine) throw new Error('Cannot find Linux agent init');
linux = exact(linux, initLine,
  initLine.replace(/--gateway "[^"]+"/, '--gateway "ws://127.0.0.1:8766/device"'));
linux = exact(linux, 'mkdir -p ~/.config/systemd/user',
  'BACKEND_ROOT="$HOME/.local/share/vortex-commander/backend"\n' +
  'npm install --prefix "$BACKEND_ROOT" --ignore-scripts --no-audit --no-fund --save-exact @wonderwhy-er/desktop-commander@0.3.3\n' +
  'npm pkg set --prefix "$BACKEND_ROOT" overrides.node-forge=1.4.3 overrides.exceljs.uuid=11.1.1\n' +
  'npm install --prefix "$BACKEND_ROOT" --ignore-scripts --no-audit --no-fund\n' +
  'node agent/configure-backend.mjs\n' +
  'mkdir -p ~/.config/systemd/user');
linux = exact(linux, 'for u in gateway agent; do',
  'NODE_BIN="$(command -v node)"\nfor u in gateway agent; do');
linux = exact(linux, 'sed -e "s#@BIND_HOST@#$BIND_HOST#g"',
  'sed -e "s#@NODE_BIN@#$NODE_BIN#g" -e "s#@BIND_HOST@#$BIND_HOST#g"');
put('deploy/install-linux.sh', linux);
// Isolate the VORTEX gateway on 127.0.0.1:8766, never claim port 8765.
const gatewayUnit = 'deploy/remote-mcp-gateway.service.in';
put(gatewayUnit, exact(get(gatewayUnit), '--port 8765', '--port 8766'));
for (const name of ['agent', 'gateway']) {
  const rel = 'deploy/remote-mcp-' + name + '.service.in';
  put(rel, exact(get(rel), '/usr/bin/node', '@NODE_BIN@'));
}
fs.copyFileSync(path.join(kitDir, 'configure-backend.mjs'),
  path.join(root, 'agent', 'configure-backend.mjs'));
fs.copyFileSync(path.join(kitDir, 'racines-mcp.mjs'),
  path.join(root, 'agent', 'racines-mcp.mjs'));
fs.copyFileSync(path.join(kitDir, 'state-backup.mjs'),
  path.join(root, 'gateway', 'state-backup.mjs'));


/* Performance overlay: read-only batched checks; opt-in metadata-only traces.
   Applied to the fixed upstream version; fail closed on changed anchors. */
let gatewayPerf = get('gateway/server.js');
gatewayPerf = exact(gatewayPerf, "    const { device_id: _target, ...forwardArgs } = args; // device_id is ours, not the backend's", "    if (tool === 'quick_checks') {\n      // Reject the entire request before executing any subcall if it is malformed.\n      if (!args || typeof args !== 'object' || Array.isArray(args) ||\n          Object.keys(args).some((k) => !['device_id', 'checks'].includes(k)) ||\n          typeof args.device_id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(args.device_id) ||\n          !Array.isArray(args.checks) || args.checks.length < 1 || args.checks.length > 4)\n        throw new RelayError('INVALID_ARGUMENT', 'An explicit device_id and 1-4 checks are required');\n      const commands = { whoami: 'whoami', pwd: 'pwd', uptime: 'uptime' };\n      const entries = args.checks.map((check) => {\n        if (!check || typeof check !== 'object' || Array.isArray(check))\n          throw new RelayError('INVALID_ARGUMENT', 'Each check must be an object');\n        const type = check.type;\n        if (type === 'get_file_info' || type === 'list_directory') {\n          if (Object.keys(check).some((k) => !['type', 'path'].includes(k)) ||\n              typeof check.path !== 'string' || check.path.length < 1 || check.path.length > 768 ||\n              check.path.includes('\\0'))\n            throw new RelayError('INVALID_ARGUMENT', 'A file check needs a valid path');\n          return { type, args: { path: check.path } };\n        }\n        if (!Object.hasOwn(commands, type) || Object.keys(check).some((k) => k !== 'type'))\n          throw new RelayError('INVALID_ARGUMENT', 'Only fixed read-only command checks are supported');\n        return { type, args: { command: commands[type], timeout_ms: 10000 } };\n      });\n      deviceId = args.device_id;\n      if (!devices.has(deviceId)) throw new RelayError('DEVICE_OFFLINE', 'Target device is not online');\n      // Some stdio-backed terminals interleave output when started simultaneously.\n      // Keep fixed command checks sequential while unrelated file metadata checks run concurrently.\n      let commandLane = Promise.resolve();\n      const results = await Promise.all(entries.map(async (item, index) => {\n        const started = Date.now();\n        const name = Object.hasOwn(commands, item.type) ? 'start_process' : item.type;\n        let ok = false, error = null, preview = '';\n        try {\n          // Each subcall passes through the existing agent and all its policy rules.\n          const execute = async () => {\n            const response = await relay(deviceId, 'tools/call',\n              { name, arguments: item.args }, Math.min(cfg.callTimeoutMs, 15000));\n            let followText = '';\n            if (name === 'start_process' && response?.isError !== true) {\n              const initial = (response.content ?? []).filter((c) => c?.type === 'text')\n                .map((c) => String(c.text ?? '')).join('');\n              // Some tiny commands finish before start_process has flushed stdout.\n              if (initial.includes('Initial output:' + String.fromCharCode(10, 10))) {\n                const pid = /Process started with PID ([0-9]+)/.exec(initial)?.[1];\n                if (!pid) throw new RelayError('OUTPUT_UNAVAILABLE', 'Process output could not be verified');\n                const follow = await relay(deviceId, 'tools/call',\n                  { name: 'read_process_output', arguments: { pid: Number(pid), timeout_ms: 2500, offset: 0 } },\n                  Math.min(cfg.callTimeoutMs, 6000));\n                if (follow?.isError === true) throw new RelayError('OUTPUT_UNAVAILABLE', 'Process output unavailable');\n                followText = (follow.content ?? []).filter((c) => c?.type === 'text')\n                  .map((c) => String(c.text ?? '')).join('');\n                if (!followText.trim()) throw new RelayError('OUTPUT_UNAVAILABLE', 'Process produced no follow-up output');\n              }\n            }\n            return { response, followText };\n          };\n          const { response, followText } = await (name === 'start_process'\n            ? (commandLane = commandLane.then(execute, execute))\n            : execute());\n          ok = response?.isError !== true;\n          if (ok) {\n            const value = (response.content ?? []).filter((c) => c?.type === 'text' && typeof c.text === 'string')\n              .map((c) => c.text).join('\\n');\n            preview = (value + (followText ? String.fromCharCode(10) + 'Follow-up output:' + String.fromCharCode(10) + followText : '')).slice(0, 400);\n          } else error = 'BACKEND_ERROR';\n        } catch (e) {\n          error = typeof e?.code === 'string' ? e.code : 'RELAY_ERROR';\n        } finally {\n          audit({ client_id: client.client_id, device_id: deviceId,\n            tool: 'quick_checks:' + item.type, duration_ms: Date.now() - started,\n            status: ok ? 'success' : 'error', error_code: error });\n        }\n        return { index, type: item.type, ok, elapsed_ms: Date.now() - started,\n          ...(error ? { error } : {}), ...(preview ? { preview } : {}) };\n      }));\n      if (results.some((r) => !r.ok)) { status = 'error'; errCode = 'PARTIAL_CHECK_FAILURE'; }\n      return { content: [{ type: 'text', text: JSON.stringify({ device_id: deviceId, results }) }] };\n    }\n    const { device_id: _target, ...forwardArgs } = args; // device_id is ours, not the backend's");
gatewayPerf = exact(gatewayPerf, "    dev.pending.set(request_id, { resolve, reject, timer, request_id });", "    dev.pending.set(request_id, { resolve, reject, timer, request_id, started_ms: performance.now() });");
gatewayPerf = exact(gatewayPerf, "      dev.pending.delete(m.request_id); clearTimeout(p.timer);", "      dev.pending.delete(m.request_id); clearTimeout(p.timer);\n      if (process.env.RMCP_TRACE_LATENCY === '1') {\n        const relayMs = Math.round(performance.now() - p.started_ms);\n        const agentMs = typeof m._vortex_agent_ms === 'number' && Number.isFinite(m._vortex_agent_ms)\n          ? Math.round(m._vortex_agent_ms) : null;\n        const overhead = agentMs === null ? 'n/a' : Math.max(0, relayMs - agentMs);\n        log('INFO', 'vortex_perf device=' + deviceId + ' relay_ms=' + relayMs +\n          ' agent_ms=' + (agentMs ?? 'n/a') + ' transport_overhead_ms=' + overhead);\n      }");
let agentPerf = get('agent/agent.js');
agentPerf = exact(agentPerf, "    const reply = (body) => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'response', request_id: m.request_id, ...body }));", "    const startedMs = performance.now();\n    const reply = (body) => ws.readyState === 1 && ws.send(JSON.stringify({\n      type: 'response', request_id: m.request_id, ...body,\n      _vortex_agent_ms: Math.round(performance.now() - startedMs)\n    }));");
put('gateway/server.js', gatewayPerf);
put('agent/agent.js', agentPerf);

console.log('VORTEX overlay applied: pinned backend, Windows policy/env, VPS localhost relay, dynamic Node path.');
