// Run inside pinned upstream/test/ in temporary CI only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const backendRoot = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA, 'VortexCommander', 'backend')
  : path.join(os.homedir(), '.local', 'share', 'vortex-commander', 'backend');
const entry = path.join(backendRoot, 'node_modules', '@wonderwhy-er', 'desktop-commander', 'dist', 'index.js');

test('Pinned Desktop Commander backend starts over stdio', { timeout: 60000 }, async () => {
  assert.ok(fs.existsSync(entry), 'Pinned backend missing: ' + entry);
  const confDir = path.join(os.homedir(), '.claude-server-commander');
  fs.mkdirSync(confDir, { recursive: true });
  fs.writeFileSync(path.join(confDir, 'config.json'), JSON.stringify({ telemetryEnabled: false }));
  const transport = new StdioClientTransport({
    command: process.execPath, args: [entry],
    env: { ...process.env }, stderr: 'pipe'
  });
  const client = new Client({ name: 'vortex-smoke', version: '0.1.0' }, { capabilities: {} });
  try {
    await Promise.race([
      client.connect(transport),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Desktop Commander initialize timeout')), 45000))
    ]);
    const names = (await client.listTools()).tools.map(t => t.name);
    for (const tool of ['read_file','write_file','edit_block','start_process','list_directory'])
      assert.ok(names.includes(tool), 'Required tool missing: ' + tool);
    console.log('Backend MCP tools: ' + names.length);
  } finally {
    await client.close().catch(() => {});
  }
});
