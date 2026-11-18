import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';
import WebSocket from 'ws';
import { RACINES_NATIVE_TOOLS, withRacinesTools } from '../gateway/racines-native-tools.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  for (let i=0;i<100;i++) { try { if(await fn()) return; } catch {} await pause(50); }
  throw Error('Native Racines test timeout');
}
test('native Racines catalog is unique, read-only and independent of device snapshots', () => {
  const result=withRacinesTools([{name:'read_file'},...RACINES_NATIVE_TOOLS]);
  assert.deepEqual(result.map(x=>x.name),['read_file',...RACINES_NATIVE_TOOLS.map(t=>t.name)]);
  for(const tool of RACINES_NATIVE_TOOLS) {
    assert.equal(tool.annotations.readOnlyHint,true);
    assert.equal(tool.annotations.destructiveHint,false);
    assert.equal(tool.inputSchema.additionalProperties,false);
    assert.equal(Object.hasOwn(tool.inputSchema.properties,'device_id'),false);
  }
});
test('native HTTP tools route to the reader without a selection, survive snapshots, and fail closed offline', {timeout:30000}, async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vortex-native-racines-'));
  const db=path.join(dir,'state.sqlite');
  const env={...process.env,RMCP_DB:db};
  const admin=(...args)=>execFileSync(process.execPath,['gateway/admin.js',...args],{env,encoding:'utf8'});
  const secret=(out,key)=>new RegExp(key+':\\s+(\\S+)').exec(out)[1];
  const token=secret(admin('client-create','native-test'),'client_token');
  const readerSecret=secret(admin('device-create','racines-reader'),'device_secret');
  const otherSecret=secret(admin('device-create','other-device'),'device_secret');
  const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const child=spawn(process.execPath,['gateway/server.js','--host','127.0.0.1','--port',String(port),'--db',db],{env,stdio:'ignore'});
  const sockets=[];
  t.after(async()=>{for(const ws of sockets)ws.terminate();child.kill();if(child.exitCode===null)await once(child,'exit');fs.rmSync(dir,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+port;
  await until(async()=>{const r=await fetch(base+'/mcp',{method:'POST',body:'{}'});return r.status===401;});
  let sid,id=0;
  async function call(method,params={}) {
    const r=await fetch(base+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(sid?{'Mcp-Session-Id':sid}:{})},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});
    sid=r.headers.get('mcp-session-id')||sid;const body=await r.json();assert.equal(body.error,undefined,JSON.stringify(body.error));return body.result;
  }
  const init=await call('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}});
  assert.match(init.instructions,/racines_get_research_dossier/);
  const names=async()=> (await call('tools/list')).tools.map(x=>x.name);
  assert.ok((await names()).includes('racines_find_people'),'reader offline still discoverable');
  const requests=[];
  async function fakeDevice(deviceId,deviceSecret,tools,builtin=[]) {
    const ws=new WebSocket('ws://127.0.0.1:'+port+'/device',{headers:{Authorization:'Bearer '+deviceSecret,'X-Device-Id':deviceId}});sockets.push(ws);
    ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='request') {requests.push({deviceId,...m.params});ws.send(JSON.stringify({type:'response',request_id:m.request_id,result:{content:[{type:'text',text:JSON.stringify({fictive:true,deviceId,tool:m.params.name})}]}}));}});
    await once(ws,'open');ws.send(JSON.stringify({type:'hello',protocol_version:1,device_id:deviceId,platform:'test',hostname:'fictive',tools,builtin_tools:builtin}));
    await until(async()=>JSON.parse((await call('tools/call',{name:'devices_list'})).content[0].text).some(x=>x.device_id===deviceId&&x.status==='online'));
    return ws;
  }
  const reader=await fakeDevice('racines-reader',readerSecret,RACINES_NATIVE_TOOLS);
  await fakeDevice('other-device',otherSecret,[{name:'read_file',inputSchema:{type:'object',properties:{}}}],[{name:'read_file',inputSchema:{type:'object',properties:{}}}]);
  await call('tools/call',{name:'device_select',arguments:{device_id:'other-device'}});
  for(const tool of RACINES_NATIVE_TOOLS) {
    const result=await call('tools/call',{name:tool.name,arguments:{}});
    assert.notEqual(result.isError,true);assert.equal(JSON.parse(result.content[0].text).deviceId,'racines-reader');
  }
  assert.equal(requests.length,5);assert.ok(requests.every(r=>!Object.hasOwn(r.arguments,'device_id')));
  const redirected=await call('tools/call',{name:'racines_list_families',arguments:{device_id:'other-device'}});
  assert.equal(redirected.structuredContent.error.code,'INVALID_ARGUMENT');assert.equal(requests.length,5);
  assert.equal((await names()).filter(n=>n==='racines_find_people').length,1,'Desktop Commander snapshot must not erase native tools');
  reader.terminate();await until(async()=>JSON.parse((await call('tools/call',{name:'devices_list'})).content[0].text).find(x=>x.device_id==='racines-reader')?.status==='offline');
  const offline=await call('tools/call',{name:'racines_list_families',arguments:{}});
  assert.equal(offline.structuredContent.error.code,'DEVICE_OFFLINE');
  assert.ok((await names()).includes('racines_get_research_dossier'));
});
