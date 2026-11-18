// Smoke the real RACINES MCP stdio process with a private, empty HOME.
// No production certificates, browser, account, family records or network calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import https from 'node:https';
import { execFileSync } from 'node:child_process';

test('RACINES MCP exposes exactly five read-only tools and never reveals missing credentials', async t => {
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
    ['find_people', 'get_research_dossier', 'list_families', 'read_research', 'search_research']
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
    ['search_research', { query: 'Fictive' }],
    ['read_research', { path: 'recherches/fictive.md' }],
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


test('RACINES MCP accepts canonical UUIDs and reaches the mTLS API for search, dossier and journal cursor', {skip: process.platform === 'win32'}, async t => {
  const home=mkdtempSync(join(tmpdir(),'vortex-racines-mtls-'));
  t.after(()=>rmSync(home,{recursive:true,force:true}));
  const conf=join(home,'.config','vortex-commander');mkdirSync(conf,{recursive:true,mode:0o700});
  const openssl=(...args)=>execFileSync('openssl',args,{cwd:conf,stdio:'ignore'});
  openssl('req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem','-days','1','-subj','/CN=FictiveCA');
  for(const [name,extension] of [['server','subjectAltName=DNS:racines-vortex.internal\nextendedKeyUsage=serverAuth\n'],['client','extendedKeyUsage=clientAuth\n']]) {
    openssl('req','-newkey','rsa:2048','-nodes','-keyout',name+'.key','-out',name+'.csr','-subj','/CN='+name);
    writeFileSync(join(conf,name+'.ext'),extension);
    openssl('x509','-req','-in',name+'.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out',name+'.pem','-days','1','-extfile',name+'.ext');
  }
  for(const name of ['ca.pem','client.pem','client.key'])chmodSync(join(conf,name),0o600);
  const paths=[];
  const server=https.createServer({key:readFileSync(join(conf,'server.key')),cert:readFileSync(join(conf,'server.pem')),ca:readFileSync(join(conf,'ca.pem')),requestCert:true,rejectUnauthorized:true},(req,res)=>{
    paths.push(req.url);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({fictive:true,path:req.url}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  writeFileSync(join(conf,'racines-mtls.json'),JSON.stringify({servername:'racines-vortex.internal',port:server.address().port,ca:join(conf,'ca.pem'),cert:join(conf,'client.pem'),key:join(conf,'client.key')}),{mode:0o600});
  const client=new Client({name:'racines-mtls-ci',version:'1'},{capabilities:{}});
  const transport=new StdioClientTransport({command:process.execPath,args:[resolve('agent/racines-mcp.mjs')],env:{...process.env,HOME:home},stderr:'pipe'});
  t.after(async()=>{await client.close().catch(()=>{});await transport.close().catch(()=>{});});
  await client.connect(transport);
  const familyId='11111111-1111-4111-8111-111111111111';
  const cursor='22222222-2222-4222-a222-222222222222';
  const cases=[['search_research',{query:'Rapport fictif',offset:20}],['read_research',{path:'recherches/fictive.md',fromLine:2,maxLines:5}],['list_families',{}],['find_people',{familyId,query:'Doya'}],['get_research_dossier',{familyId,personId:'personne-fictive'}],['get_research_dossier',{familyId,personId:'personne-fictive',before:cursor}]];
  for(const [name,args] of cases) {
    const result=await client.callTool({name,arguments:args});
    assert.notEqual(result.isError,true,name+': '+JSON.stringify(result));
    assert.equal(JSON.parse(result.content[0].text).fictive,true);
  }
  assert.deepEqual(paths,['/v1/research/search?q=Rapport%20fictif&offset=20','/v1/research/document?path=recherches%2Ffictive.md&fromLine=2&maxLines=5','/v1/families','/v1/families/'+familyId+'/people?q=Doya','/v1/families/'+familyId+'/people/personne-fictive/research-dossier','/v1/families/'+familyId+'/people/personne-fictive/research-dossier?before='+cursor]);
  const invalid=await client.callTool({name:'find_people',arguments:{familyId:'11111111-1111-4111-8111111111111',query:'Doya'}});
  assert.equal(invalid.isError,true);
  assert.equal(paths.length,6,'malformed family IDs must never reach the API');
});
