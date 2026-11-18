// Ephemeral CI-only Chrome DevTools MCP integration smoke.
// A loopback-only web page; no personal session, credential or production host.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createBrowserAgentSession } from '../agent/browser-agent-session.mjs';

test('human click and keyboard use the same paused Chrome page and preserve its cookie',
  {timeout:120000}, async t => {
    let submitted = '', receivedCookie = '';
    const server = createServer((req,res) => {
      if (req.url === '/submit') {
        receivedCookie = req.headers.cookie || '';
        req.on('data',chunk => {submitted += chunk;});
      }
      res.writeHead(200,{'content-type':'text/html','set-cookie':'handoff_fixture=same-browser; Path=/; HttpOnly; SameSite=Lax'});
      res.end('<title>Human handoff fixture</title><form action="/submit" method="post"><input name="name" style="position:absolute;left:40px;top:60px;width:300px;height:40px"><button style="position:absolute;left:40px;top:130px">Send</button></form>');
    });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    t.after(() => {server.closeAllConnections();server.close();});
    const cli = path.join(process.env.VORTEX_BROWSER_STAGED_PACKAGE,'out','Default','gen','src','bin','chrome-devtools-mcp.js');
    const transport = new StdioClientTransport({command:process.execPath,args:[cli,'--headless','--isolated',
      '--experimental-vision','--executablePath='+process.env.VORTEX_TEST_CHROME_BIN,
      '--no-javascript-evaluation','--no-file-navigations','--redact-network-headers','--no-usage-statistics','--no-performance-crux'],stderr:'pipe'});
    const client = new Client({name:'vortex-human-ci',version:'1'},{capabilities:{}});
    t.after(async () => {await client.close();await transport.close();});
    await client.connect(transport);
    const available = await client.listTools();
    assert.ok(available.tools.some(tool => tool.name === 'click_at'));
    const execute = (name,args) => client.callTool({name,arguments:args});
    const session = createBrowserAgentSession(({route,args}) => execute(route.real,args),execute);
    const listing = await execute('list_pages',{});
    const pageId = Number(listing.content.map(row => row.text || '').join('\n').match(/(?:^|\n)\s*(\d+):/)[1]);
    const url = 'http://127.0.0.1:'+server.address().port;
    assert.notEqual((await session.run({real:'navigate_page'},{pageId,url},12000)).isError,true);
    session.control('browser_session_pause');
    const click = await session.control('browser_session_human',{action:'click',pageId,x:100,y:80});
    assert.notEqual(click.isError,true);
    const typed = await session.control('browser_session_human',{action:'type',pageId,text:'VORTEX_HUMAN_OK'});
    assert.notEqual(typed.isError,true);
    assert.doesNotMatch(JSON.stringify(typed),/VORTEX_HUMAN_OK/);
    assert.notEqual((await session.control('browser_session_human',{action:'key',pageId,key:'Enter'})).isError,true);
    assert.match(submitted,/name=VORTEX_HUMAN_OK/);
    assert.match(receivedCookie,/handoff_fixture=same-browser/);
    const frame = await session.control('browser_session_view',{action:'frame',pageId});
    assert.ok(frame.content.some(row => row.type === 'image'));
    const state = JSON.parse(session.control('browser_session_status').content[0].text);
    assert.equal(state.state,'paused');
    assert.doesNotMatch(JSON.stringify(state),/VORTEX_HUMAN_OK|same-browser/);
    session.control('browser_session_resume');
    assert.notEqual((await session.run({real:'take_snapshot'},{pageId},12000)).isError,true);
  });

test('dedicated browser profile retains a fixture cookie across real Chrome restarts',
  { timeout: 120000 }, async t => {
    const profile = mkdtempSync(path.join(tmpdir(), 'vortex-chrome-profile-'));
    let cookieReceived = false;
    const server = createServer((req, res) => {
      if (req.url === '/check') cookieReceived = (req.headers.cookie || '').includes('vortex_fixture=present');
      res.writeHead(200, {
        'content-type': 'text/html',
        'set-cookie': 'vortex_fixture=present; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax'
      });
      res.end('<title>VORTEX profile fixture</title>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
      server.closeAllConnections();
      server.close();
      rmSync(profile, { recursive: true, force: true });
    });
    const cli = path.join(process.env.VORTEX_BROWSER_STAGED_PACKAGE,
      'out', 'Default', 'gen', 'src', 'bin', 'chrome-devtools-mcp.js');
    for (const route of ['/set', '/check']) {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [cli, '--headless', '--user-data-dir=' + profile,
          '--executablePath=' + process.env.VORTEX_TEST_CHROME_BIN,
          '--no-javascript-evaluation', '--no-file-navigations',
          '--redact-network-headers', '--no-usage-statistics', '--no-performance-crux'],
        stderr: 'pipe'
      });
      const client = new Client({ name: 'vortex-profile-ci', version: '1.0.0' }, { capabilities: {} });
      try {
        await client.connect(transport);
        const pages = await client.callTool({ name: 'list_pages', arguments: {} });
        const text = (pages.content || []).map(item => item.text || '').join('\n');
        const page = text.match(/(?:^|\n)\s*(\d+):\s+/);
        assert.ok(page, 'Chrome must provide a page ID');
        const result = await client.callTool({ name: 'navigate_page', arguments: {
          pageId: Number(page[1]),
          url: 'http://127.0.0.1:' + server.address().port + route
        } });
        assert.notEqual(result.isError, true);
      } finally {
        await client.close();
        await transport.close();
      }
    }
    assert.ok(cookieReceived, 'Cookie from the first browser must survive the restart');
  });

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
  t.after(() => new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  }));
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

  const initial = await client.callTool({name: 'list_pages', arguments: {}});
  assert.equal(initial.isError, undefined, 'Cannot inspect initial browser tabs');
  const tabText = (initial.content ?? []).map(x => x.text ?? '').join('\n');
  const tab = tabText.match(/(?:^|\n)\s*(\d+):\s+/);
  assert.ok(tab, 'Could not obtain an actual pageId from Chrome: ' + tabText.slice(0,400));
  const pageId = Number(tab[1]);
  const output = await client.callTool({name: 'navigate_page', arguments: {
    pageId, url: 'http://127.0.0.1:' + port + '/smoke'
  }});
  assert.equal(output.isError, undefined, JSON.stringify(output.content).slice(0,1000));
  const navResponse = (output.content ?? []).map(x => x.text ?? '').join('\n');
  assert.match(navResponse, /VORTEX isolated browser CI test/, 'Browser did not load the test page title');
  const snapshot = await client.callTool({name: 'take_snapshot', arguments: {pageId}});
  assert.equal(snapshot.isError, undefined, JSON.stringify(snapshot.content).slice(0,1000));
  const snapshotText = (snapshot.content ?? []).map(x => x.text ?? '').join('\n');
  assert.match(snapshotText, /VORTEX_BROWSER_SMOKE_OK/, 'Rendered page content missing from DOM snapshot');
  const list = await client.callTool({name: 'list_pages', arguments: {}});
  assert.equal(list.isError, undefined, 'Cannot inspect page list after navigation');
  assert.match((list.content ?? []).map(x => x.text ?? '').join('\n'), /127\.0\.0\.1/, 'Opened page missing');
});
