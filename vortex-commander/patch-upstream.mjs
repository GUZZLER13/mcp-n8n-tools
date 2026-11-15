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
const get = rel => fs.readFileSync(path.join(root, rel), 'utf8');
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
put('agent/policy.js', policy);

let agent = get('agent/agent.js');
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
put('agent/agent.js', agent);

// The gateway and VPS agent initially talk only over localhost. We do not
// send device secrets to an old public bridge at the same hostname.
let linux = get('deploy/install-linux.sh');
linux = exact(linux, 'npm install --omit=dev --silent',
  'npm ci --omit=dev --ignore-scripts --no-audit --no-fund --silent');
const initLine = linux.split('\n').find(x => x.includes('node agent/agent.js init --gateway'));
if (!initLine) throw new Error('Cannot find Linux agent init');
linux = exact(linux, initLine,
  initLine.replace(/--gateway "[^"]+"/, '--gateway "ws://127.0.0.1:8765/device"'));
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
for (const name of ['agent', 'gateway']) {
  const rel = 'deploy/remote-mcp-' + name + '.service.in';
  put(rel, exact(get(rel), '/usr/bin/node', '@NODE_BIN@'));
}
fs.copyFileSync(path.join(kitDir, 'configure-backend.mjs'),
  path.join(root, 'agent', 'configure-backend.mjs'));

console.log('VORTEX overlay applied: pinned backend, Windows policy/env, VPS localhost relay, dynamic Node path.');
