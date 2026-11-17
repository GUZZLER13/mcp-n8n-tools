import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogFromAdapted, summarizeDomain} from './caddy-catalog.mjs';

const timestamp='2026-11-17T19:00:00.000Z';
const fixture={
  apps:{http:{servers:{srv0:{routes:[
    {match:[{host:['mcp.guzzler-bot.cloud']}],handle:[
      {handler:'subroute',routes:[
        {match:[{path:['/mcp','/health']}],handle:[
          {handler:'reverse_proxy',upstreams:[{dial:'127.0.0.1:8766'}],headers:{request:{set:{Authorization:['Bearer TOP_SECRET']}}}}]}
      ]}
    ]},
    {match:[{host:['homepage.guzzler-bot.cloud']}],handle:[
      {handler:'file_server',root:'/private/site/home',hidden:['/secret']},
      {handler:'reverse_proxy',upstreams:[{dial:'localhost:13000'}]}]},
    {match:[{host:['private.guzzler-bot.cloud']}],handle:[
      {handler:'reverse_proxy',upstreams:[{dial:'administrator:password@10.0.0.4:9999'},{dial:'unix//var/run/secret.sock'}]}]},
    {match:[{host:['evil?secret=token']}],handle:[
      {handler:'reverse_proxy',upstreams:[{dial:'127.0.0.1:8999'}]}]}
  ]}}}}
};

test('Caddy inventory follows nested routes with provenance and no health claims', () => {
  const data=catalogFromAdapted(fixture,timestamp);
  assert.deepEqual(data.domains,[
    'homepage.guzzler-bot.cloud','mcp.guzzler-bot.cloud','private.guzzler-bot.cloud'
  ]);
  assert.equal(data.source.type,'caddy_adapt');
  assert.equal(data.source.device,'vps-hetzner');
  assert.equal(data.observedAt,timestamp);
  assert.equal(data.confidence,'configured_not_health_checked');
  const m=summarizeDomain(data,'MCP.GUZZLER-BOT.CLOUD');
  assert.equal(m.status,'configured_not_health_checked');
  assert.deepEqual(m.routes[0].paths,['/health','/mcp']);
  assert.deepEqual(m.routes[0].targets,['loopback:8766']);
  const home=summarizeDomain(data,'homepage.guzzler-bot.cloud');
  assert.equal(home.routes.length,2);
  assert.ok(home.routes.some(r=>r.kind==='file_server'));
});

test('never exports secrets, filesystem roots, upstream userinfos or private network hosts',()=>{
  const out=JSON.stringify(catalogFromAdapted(fixture,timestamp));
  for(const secret of ['TOP_SECRET','/private/site/home','/secret','administrator',
    'password','10.0.0.4','unix//var/run/secret.sock','evil?secret=token']){
    assert.ok(!out.includes(secret), 'found a forbidden field: '+secret);
  }
  assert.ok(out.includes('external_or_socket_redacted'));
});

test('rejects invalid hostname, invalid date and missing HTTP server configuration',()=>{
  assert.throws(()=>summarizeDomain(catalogFromAdapted(fixture,timestamp),'https://mcp.guzzler-bot.cloud/mcp'),/INVALID_DOMAIN/);
  assert.throws(()=>catalogFromAdapted({},timestamp),/CADDY_HTTP_SERVERS_MISSING/);
  assert.throws(()=>catalogFromAdapted(fixture,'not-a-date'),/INVALID_OBSERVATION_TIME/);
  assert.deepEqual(summarizeDomain(catalogFromAdapted(fixture,timestamp),'other.example').status,'not_found_in_caddy');
});

test('identical reverse proxy routes are deduplicated and count is deterministic',()=>{
  const x=structuredClone(fixture);
  x.apps.http.servers.srv0.routes.push(structuredClone(x.apps.http.servers.srv0.routes[1]));
  const d=catalogFromAdapted(x,timestamp);
  assert.equal(summarizeDomain(d,'homepage.guzzler-bot.cloud').routes.length,2);
  assert.deepEqual(d,catalogFromAdapted(x,timestamp));
});

test('dangerous path matcher details are not emitted',()=>{
  const x=structuredClone(fixture);
  x.apps.http.servers.srv0.routes.push({match:[{host:['test.example']}],handle:[{
    handler:'subroute',routes:[{match:[{path:['/token?secret=DO_NOT_EXPORT']}],
      handle:[{handler:'static_response',body:'PASSWORD=ULTRA_SECRET'}]}]
  }]});
  const out=JSON.stringify(catalogFromAdapted(x,timestamp));
  assert.ok(!out.includes('DO_NOT_EXPORT'));
  assert.ok(!out.includes('ULTRA_SECRET'));
});
