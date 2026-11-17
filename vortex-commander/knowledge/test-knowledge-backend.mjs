// Run in pinned upstream checkout after the VORTEX overlay has been applied.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const {CATALOG,resolveBackend} = await import(pathToFileURL(path.resolve('agent/backends.js')).href);

test('Knowledge backend exists in VORTEX catalog but needs explicit local opt-in',()=>{
  assert.equal(CATALOG.knowledge.prefix,'knowledge_');
  assert.deepEqual(CATALOG.knowledge.params,[]);
  const old=process.env.VORTEX_KNOWLEDGE_ENABLED;
  delete process.env.VORTEX_KNOWLEDGE_ENABLED;
  try{
    assert.throws(()=>resolveBackend({template:'knowledge',name:'knowledge'},{}),
      /Knowledge requires a locally authorized unprivileged Linux agent/);
  }finally{
    if(old===undefined)delete process.env.VORTEX_KNOWLEDGE_ENABLED;
    else process.env.VORTEX_KNOWLEDGE_ENABLED=old;
  }
});

test('fixed Knowledge program is read-only and rejects remote params',()=>{
  const old=process.env.VORTEX_KNOWLEDGE_ENABLED;
  process.env.VORTEX_KNOWLEDGE_ENABLED='true';
  try{
    assert.throws(()=>resolveBackend({template:'knowledge',name:'knowledge',
      params:{command:'/bin/sh'}},{}),/Invalid Knowledge options/);
    assert.throws(()=>resolveBackend({template:'knowledge',name:'anything-else'},{}),
      /Invalid Knowledge options/);
    if(process.platform==='linux' && process.getuid?.()!==0){
      const b=resolveBackend({template:'knowledge',name:'knowledge',params:{}},{});
      assert.equal(b.command[0],process.execPath);
      assert.equal(b.command.length,2);
      assert.equal(path.basename(b.command[1]),'knowledge-mcp.mjs');
      assert.equal(b.prefix,'knowledge_');
    }
  }finally{
    if(old===undefined)delete process.env.VORTEX_KNOWLEDGE_ENABLED;
    else process.env.VORTEX_KNOWLEDGE_ENABLED=old;
  }
});

test('Knowledge MCP refuses startup unless locally enabled',()=>{
  const cmd=path.resolve('agent/knowledge-mcp.mjs');
  const stopped=spawnSync(process.execPath,[cmd],{
    timeout:10000,encoding:'utf8',
    env:{...process.env,VORTEX_KNOWLEDGE_ENABLED:'false'}
  });
  assert.equal(stopped.status,1);
  assert.match(stopped.stderr,/KNOWLEDGE_DISABLED_LOCAL_OPT_IN_REQUIRED/);
});

test('authorized Knowledge MCP exposes only two read-only tools', {skip:process.platform!=='linux'||process.getuid?.()===0,timeout:15000},async t=>{
  const transport=new StdioClientTransport({
    command:process.execPath,
    args:[path.resolve('agent/knowledge-mcp.mjs')],
    env:{...process.env,VORTEX_KNOWLEDGE_ENABLED:'true'},
    stderr:'pipe'
  });
  const client=new Client({name:'knowledge-ci',version:'1.0.0'},{capabilities:{}});
  t.after(async()=>{await client.close().catch(()=>{});await transport.close().catch(()=>{});});
  await client.connect(transport);
  const tools=await client.listTools();
  assert.deepEqual(tools.tools.map(x=>x.name),['list_domains','inspect_domain']);
  for(const t of tools.tools)assert.deepEqual(t.inputSchema.type,'object');
  const forbidden=await client.callTool({name:'list_domains',arguments:{path:'/etc/shadow'}});
  assert.equal(forbidden.isError,true);
  const invalid=await client.callTool({name:'inspect_domain',arguments:{domain:'file:///etc/passwd'}});
  assert.equal(invalid.isError,true);
  for(const r of [forbidden,invalid])
    assert.match(JSON.stringify(r.content),/KNOWLEDGE_READ_FAILED_OR_UNAVAILABLE/);
});
