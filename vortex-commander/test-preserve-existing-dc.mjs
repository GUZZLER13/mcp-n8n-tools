// Regression: preparing VORTEX must not rewrite an existing Desktop Commander
// configuration shared with the old, connected agent on the same OS account.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const prepare = path.resolve('vortex-commander/configure-backend.mjs');
test('existing Desktop Commander settings and permissions are preserved', () => {
  for (const existing of [true, false]) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vortex-preserve-dc-'));
    try {
      const localAppData = path.join(home, 'AppData', 'Local');
      const dcFile = path.join(home, '.claude-server-commander', 'config.json');
      const deviceFile = path.join(home, '.config', 'remote-mcp', 'device.json');
      const backend = process.platform === 'win32'
        ? path.join(localAppData, 'VortexCommander', 'backend')
        : path.join(home, '.local', 'share', 'vortex-commander', 'backend');
      const entry = path.join(backend, 'node_modules', '@wonderwhy-er', 'desktop-commander', 'dist', 'index.js');
      fs.mkdirSync(path.dirname(entry), { recursive: true });
      fs.writeFileSync(entry, '// test fake entrypoint');
      fs.mkdirSync(path.dirname(deviceFile), { recursive: true });
      fs.writeFileSync(deviceFile, JSON.stringify({ device_id: 'vps-hetzner', device_secret: 'fixture-not-a-real-token', gateway: 'ws://127.0.0.1:8766/device' }));
      const original = '{\n  "telemetryEnabled": true,\n  "allowedDirectories": [],\n  "blockedCommands": ["sudo", "reboot"]\n}\n';
      if (existing) {
        fs.mkdirSync(path.dirname(dcFile), { recursive: true });
        fs.writeFileSync(dcFile, original, { mode: 0o664 });
      }
      const priorStat = existing ? fs.statSync(dcFile).mode & 0o777 : null;
      const result = spawnSync(process.execPath, [prepare], {
        encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: localAppData },
        timeout: 15000
      });
      assert.equal(result.status, 0, (result.stderr || result.stdout).slice(0, 650));
      const config = fs.readFileSync(dcFile, 'utf8');
      if (existing) {
        assert.equal(config, original, 'existing settings changed');
        if (process.platform !== 'win32') assert.equal(fs.statSync(dcFile).mode & 0o777, priorStat, 'existing file mode changed');
      } else {
        assert.equal(JSON.parse(config).telemetryEnabled, false, 'new config must opt out of telemetry');
      }
      const agent = JSON.parse(fs.readFileSync(deviceFile, 'utf8'));
      assert.equal(agent.device_id, 'vps-hetzner');
      assert.equal(agent.desktop_commander.command[0], process.execPath);
      assert.equal(agent.desktop_commander.command[1], entry);
    } finally {
      fs.rmSync(home, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
    }
  }
});
