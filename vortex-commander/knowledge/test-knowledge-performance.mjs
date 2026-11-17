import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createInventoryCache} from './knowledge-cache.mjs';

const sample=(revision)=>({domains:['mcp.guzzler-bot.cloud'],routes:[],observedAt:'2026-11-17T19:00:00Z',revision});

test('Knowledge cache never re-runs Caddy during 1000 normal queries',async()=>{
  let reads=0;
  const cache=createInventoryCache(async()=>{reads++;return sample(reads);});
  assert.equal((await cache.get()).inventory.revision,1);
  const start=performance.now();
  const result=await Promise.all(Array.from({length:1000},()=>cache.get()));
  const elapsed=performance.now()-start;
  assert.equal(reads,1,'Caddy must be called only once, not for each question');
  assert.ok(result.every(r=>r.cached&&r.freshness==='fresh'));
  assert.ok(elapsed<1000,'1000 cached requests took '+elapsed.toFixed(0)+'ms');
});

test('multiple simultaneous cold requests coalesce into a single scan',async()=>{
  let resolveScan,reads=0;
  const cache=createInventoryCache(()=>{reads++;return new Promise(resolve=>{resolveScan=resolve;});});
  const requests=Array.from({length:10},()=>cache.get());
  await Promise.resolve();
  assert.equal(reads,1);
  resolveScan(sample(1));
  const result=await Promise.all(requests);
  assert.equal(result.length,10);
  assert.ok(result.every(x=>x.inventory.revision===1));
});

test('stale lookup returns immediately while background refresh runs once',async()=>{
  let ms=0,reads=0,finish;
  const cache=createInventoryCache(()=>{
    reads++;
    if(reads===1)return sample(1);
    return new Promise(resolve=>{finish=resolve;});
  },{ttlMs:1000,retryMs:1000,now:()=>ms});
  await cache.get();
  ms=1200;
  const stale=await cache.get();
  assert.equal(stale.freshness,'stale');
  assert.equal(stale.inventory.revision,1);
  assert.equal(stale.cached,true);
  const staleAgain=await cache.get();
  assert.equal(staleAgain.inventory.revision,1);
  await Promise.resolve();
  assert.equal(reads,2);
  finish(sample(2));
  for(let i=0;i<4;i++)await Promise.resolve();
  assert.equal((await cache.get()).inventory.revision,2);
});

test('failed Caddy read is throttled and never destroys a good old snapshot',async()=>{
  let clock=0,attempts=0;
  const cache=createInventoryCache(async()=>{
    attempts++;
    if(attempts!==1)throw Error('no Caddy available');
    return sample(1);
  },{ttlMs:1000,retryMs:60000,now:()=>clock});
  await cache.get();
  clock=1200;
  assert.equal((await cache.get()).freshness,'stale');
  for(let i=0;i<4;i++)await Promise.resolve();
  assert.equal((await cache.get()).inventory.revision,1);
  assert.equal(attempts,2);
  clock=2000;
  await cache.get();
  assert.equal(attempts,2,'do not retry every request on failure');
});

test('cold-start failure backs off instead of repeatedly launching subprocesses',async()=>{
  let ms=1000,attempts=0;
  const cache=createInventoryCache(async()=>{attempts++;throw Error('unavailable');},
    {ttlMs:1000,retryMs:60000,now:()=>ms});
  await assert.rejects(cache.get(),/unavailable/);
  await assert.rejects(cache.get(),/KNOWLEDGE_RETRY_BACKOFF/);
  assert.equal(attempts,1);
  ms=62000;
  await assert.rejects(cache.get(),/unavailable/);
  assert.equal(attempts,2);
});
