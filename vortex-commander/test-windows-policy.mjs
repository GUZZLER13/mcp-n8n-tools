import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPolicy, check } from '../agent/policy.js';

const p = loadPolicy('/nonexistent/vortex-policy.json');
test('Windows commands cannot read credentials using user environment variables', () => {
  if (process.platform !== 'win32') return;
  const forbidden = [
    'type %USERPROFILE%\\.ssh\\id_ed25519',
    'Get-Content $env:USERPROFILE\\.ssh\\id_ed25519',
    'cat ~/.ssh/id_ed25519',
    'cat $HOME/.ssh/id_ed25519',
    'type %USERPROFILE%\\.config\\remote-mcp\\device.json'
  ];
  for (const command of forbidden)
    assert.ok(check(p, 'start_process', { command }), 'Should be denied: ' + command);
});
test('Safe commands remain usable', () => {
  assert.equal(check(p, 'start_process', { command: 'whoami' }), null);
  assert.equal(check(p, 'start_process', { command: 'git status --short' }), null);
});
