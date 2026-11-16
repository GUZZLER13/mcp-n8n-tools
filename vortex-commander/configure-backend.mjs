// After pairing, use a pinned local Desktop Commander entrypoint, never npx.
// Keep device credentials private and disable Desktop Commander opt-out telemetry.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const home = os.homedir();
const win = process.platform === 'win32';
const backendRoot = win
  ? path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'VortexCommander', 'backend')
  : path.join(home, '.local', 'share', 'vortex-commander', 'backend');
const executable = path.join(backendRoot, 'node_modules', '@wonderwhy-er', 'desktop-commander', 'dist', 'index.js');
const devicePath = path.join(home, '.config', 'remote-mcp', 'device.json');
const privacyPath = path.join(home, '.claude-server-commander', 'config.json');

function savePrivateJson(dest, object) {
  fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  const temporary = dest + '.vortex-' + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(object, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, dest);
  if (!win) fs.chmodSync(dest, 0o600);
}
if (!fs.existsSync(executable)) throw new Error('Pinned backend missing: ' + executable);
if (!fs.existsSync(devicePath)) throw new Error('Device not paired: run agent/agent.js pair');
const device = JSON.parse(fs.readFileSync(devicePath, 'utf8'));
if (!device.device_id || !device.device_secret || !device.gateway) {
  throw new Error('Invalid device config: credentials and endpoint must be present');
}
// Desktop Commander uses a shared config under HOME. On this VPS the real,
// already paired Desktop Commander has an existing config: never rewrite it,
// its telemetry setting or its file permissions during VORTEX activation.
if (fs.existsSync(privacyPath)) {
  JSON.parse(fs.readFileSync(privacyPath, 'utf8')); // fail on malformed input
  console.log('Existing Desktop Commander configuration preserved unchanged.');
} else {
  savePrivateJson(privacyPath, { telemetryEnabled: false });
  console.log('New Desktop Commander configuration created with telemetry disabled.');
}
device.desktop_commander = { command: [process.execPath, executable] };
savePrivateJson(devicePath, device);
console.log('Pinned local backend configured. Credentials were not printed.');
