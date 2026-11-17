// Smoke the real RACINES MCP stdio process with a private, empty HOME.
// No production certificates, browser, account, family records or network calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('RACINES MCP exposes exactly three read-only tools and never reveals missing credentials', async t => {
  const home = mkdtempSync(join(tmpdir(), 'vortex-racines-mcp-smoke-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const client = new Client(
    { name: 'vortex-racines-ci', version: '0.1.0' },
    { capabilities: {} }
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve('agent/racines-mcp.mjs')],
    env: { ...process.env, HOME: home },
    stderr: 'pipe'
  });
  t.after(async () => {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  });
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map(tool => tool.name).sort(),
    ['find_people', 'get_research_dossier', 'list_families']
  );
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.doesNotMatch(tool.name, /(write|edit|delete|admin|terminal|chrome)/i);
  }
  const dossier = tools.find(tool => tool.name === 'get_research_dossier').inputSchema;
  assert.equal(dossier.properties.before.type, 'string');
  assert.ok(!dossier.required.includes('before'));

  // Even with a valid-looking family ID the connector lacks a private
  // machine certificate in this isolated test HOME and must fail closed.
  const bogus = '11111111-1111-4111-8111-111111111111';
  const cases = [
    ['list_families', {}],
    ['find_people', { familyId: bogus, query: 'Marty' }],
    ['get_research_dossier', { familyId: bogus, personId: 'person-fictive' }],
    ['get_research_dossier', { familyId: bogus, personId: 'person-fictive', before: bogus }]
  ];
  for (const [name, args] of cases) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, true, name);
    assert.equal(result.content[0].type, 'text');
    assert.equal(result.content[0].text, 'Consultation RACINES indisponible ou non autorisée.');
    assert.doesNotMatch(JSON.stringify(result), /(private key|-----BEGIN|\/home\/|\/tmp\/)/i);
  }
});
