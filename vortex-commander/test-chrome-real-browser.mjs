// Ephemeral CI-only Chrome DevTools MCP integration smoke.
// A loopback-only web page; no personal session, credential or production host.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('pinned Chrome MCP starts, navigates a local page and closes cleanly', { timeout: 120000 }, async t => {
  const staged = process.env.VORTEX_BROWSER_STAGED_PACKAGE;
  const chrome = process.env.VORTEX_TEST_CHROME_BIN;
  assert.ok(staged && path.isAbsolute(staged), 'Pinned Chrome npm package path required');
  assert.ok(chrome && path.isAbsolute(chrome) && existsSync(chrome), 'Real Chrome binary required');
  const cli = path.join(staged, 'out', 'Default', 'gen', 'src', 'bin', 'chrome-devtools-mcp.js');
  assert.ok(existsSync(cli), 'Pinned browser CLI missing');

  const html = '<!doctype html><title>VORTEX isolated browser CI test</title><h1>VORTEX_BROWSER_SMOKE_OK</h1>';
  const server = createServer((req, res) => {
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'});
    res.end(html);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      cli, '--headless', '--isolated', '--executablePath=' + chrome,
      '--no-javascript-evaluation', '--no-file-navigations',
      '--redact-network-headers', '--no-usage-statistics',
      '--no-performance-crux'
    ],
    stderr: 'pipe'
  });
  const client = new Client({ name: 'vortex-browser-ci', version: '1.0.0' }, { capabilities: {} });
  t.after(async () => {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  });
  await client.connect(transport);
  const available = await client.listTools();
  const tools = available.tools.map(x => x.name);
  assert.ok(tools.includes('navigate_page'), 'Navigation tool missing');
  assert.ok(tools.includes('list_pages'), 'Page catalog missing');
  assert.ok(!tools.includes('evaluate_script'), 'Script evaluation must be disabled');
  // The upstream MCP server still advertises upload_file: VORTEX's gateway
  // disables its exposure using CATALOG.default_disabled (tested separately).
  // Do not conflate upstream tool discovery with our gateway authorization.

  const output = await client.callTool({name: 'navigate_page', arguments: {
    url: 'http://127.0.0.1:' + port + '/smoke'
  }});
  assert.equal(output.isError, undefined, JSON.stringify(output.content).slice(0,1000));
  const body = (output.content ?? []).map(x => x.text ?? '').join('\n');
  assert.match(body, /VORTEX_BROWSER_SMOKE_OK/, 'Browser did not render the local test page');
  const list = await client.callTool({name: 'list_pages', arguments: {}});
  assert.equal(list.isError, undefined, 'Cannot inspect page list after navigation');
  assert.match((list.content ?? []).map(x => x.text ?? '').join('\n'), /127\.0\.0\.1/, 'Opened page missing');
});
