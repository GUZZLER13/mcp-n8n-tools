import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserSession } from './browser-session.mjs';
import { createBrowserAgentSession, browserSessionTools } from './browser-agent-session.mjs';

test('agent control tools are bounded, pause real dispatch and stop rejects later calls', async () => {
  const calls = [];
  const agent = createBrowserAgentSession(async payload => { calls.push(payload); return { content: [] }; });
  assert.equal(browserSessionTools.length, 6);
  assert.equal(agent.control('unrelated_tool'), null);
  assert.throws(() => agent.control('browser_session_pause', { arbitrary: true }));
  agent.control('browser_session_pause');
  const pending = agent.run({ real: 'click' }, { uid: 'fixture' }, 1500);
  assert.equal(calls.length, 0);
  agent.control('browser_session_resume');
  await pending;
  assert.equal(calls[0].timeout, 1500);
  const status = agent.control('browser_session_status');
  assert.doesNotMatch(JSON.stringify(status), /fixture/);
  agent.control('browser_session_stop');
  await assert.rejects(agent.run({ real: 'click' }, {}, 1500), /stopped/);
});

test('pause drains no queued actions, resume serializes and journal excludes private arguments', async () => {
  let release;
  const executed = [];
  const session = new BrowserSession({
    objective: 'Vérifier une page fictive',
    execute: async label => {
      executed.push(label);
      if (label === 'navigate_page') await new Promise(resolve => { release = resolve; });
      return {};
    },
    capture: async () => Buffer.from('frame')
  });
  const first = session.run('navigate_page', { password: 'secret-fixture' });
  session.pause();
  const second = session.run('take_snapshot', {});
  release();
  await first;
  assert.deepEqual(executed, ['navigate_page']);
  assert.equal(session.snapshot().pending, 1);
  session.resume();
  await second;
  assert.deepEqual(executed, ['navigate_page', 'take_snapshot']);
  assert.doesNotMatch(JSON.stringify(session.snapshot()), /secret-fixture|password/);
});

test('human takeover shares the execution lock, requires pause and redacts typed values', async () => {
  let release;
  const calls = [];
  const agent = createBrowserAgentSession(async () => ({content:[]}), async (tool,args) => {
    calls.push({tool,args});
    if (tool === 'type_text') await new Promise(resolve => {release=resolve;});
    return {content:[{type:'text',text:'echo fixture-secret'}]};
  });
  await assert.rejects(agent.control('browser_session_human',{action:'click',pageId:1,x:10,y:15}), /Pause required/);
  agent.control('browser_session_pause');
  const human = agent.control('browser_session_human',{action:'type',pageId:1,text:'fixture-secret'});
  assert.throws(() => agent.control('browser_session_resume'), /Human action still active/);
  await assert.rejects(agent.control('browser_session_view',{action:'pages'}), /busy/);
  const automated = agent.run({real:'click'},{uid:'queued'},1000);
  release();
  assert.doesNotMatch(JSON.stringify(await human), /fixture-secret/);
  assert.doesNotMatch(JSON.stringify(agent.control('browser_session_status')), /fixture-secret/);
  assert.equal(calls.length,1);
  agent.control('browser_session_resume');
  await automated;
  assert.throws(() => agent.control('browser_session_human',{action:'key',pageId:1,key:'F12'}), /Invalid key/);
  assert.throws(() => agent.control('browser_session_view',{action:'frame',pageId:1,filePath:'private'}), /Invalid viewer/);
});

test('viewer observations do not evict mission events and remain available while paused', async () => {
  const agent = createBrowserAgentSession(async () => ({content:[]}), async () => ({content:[]}));
  await agent.run({real:'navigate_page'},{},1000);
  agent.control('browser_session_pause');
  for (let i=0;i<120;i++) await agent.control('browser_session_view',{action:'frame',pageId:1});
  const snapshot = JSON.parse(agent.control('browser_session_status').content[0].text);
  assert.equal(snapshot.events.length,2);
  assert.equal(snapshot.omittedEvents,0);
  agent.control('browser_session_stop');
  await assert.rejects(agent.control('browser_session_view',{action:'pages'}),/stopped/);
});

test('stop cancels queued work, signals active work and never announces completion afterwards', async () => {
  let release, signal;
  const session = new BrowserSession({
    objective: 'Arrêt fictif',
    execute: async (_label, _args, receivedSignal) => {
      signal = receivedSignal;
      await new Promise(resolve => { release = resolve; });
    },
    capture: async () => Buffer.from('frame')
  });
  const active = assert.rejects(session.run('navigate_page', {}), /Session stopped/);
  const queued = assert.rejects(session.run('click', {}), /Session stopped/);
  session.stop();
  assert.ok(signal.aborted);
  release();
  await Promise.all([active, queued]);
  assert.equal(session.snapshot().events.at(-1).status, 'stopped');
  await assert.rejects(session.run('click', {}), /Session stopped/);
});

test('captures are lazy, shared and rate limited, stopped sessions discard frames', async () => {
  let clock = 0, captures = 0, release;
  const session = new BrowserSession({
    objective: 'Capture fictive', now: () => clock,
    execute: async () => ({}),
    capture: async () => { captures++; return new Promise(resolve => { release = resolve; }); }
  });
  assert.equal(captures, 0);
  const a = session.frame(), b = session.frame();
  assert.equal(a, b);
  await Promise.resolve();
  release(Buffer.from('frame'));
  assert.equal((await a).toString(), 'frame');
  assert.equal(await session.frame(), null);
  assert.equal(captures, 1);
  clock = 1000;
  const last = assert.rejects(session.frame(), /capture unavailable/);
  await Promise.resolve();
  session.stop();
  release(Buffer.from('late-frame'));
  await last;
});

test('overload and journal memory are bounded and snapshots cannot mutate the session', async () => {
  const session = new BrowserSession({
    objective: 'Limites fictives', maxPending: 1,
    execute: async () => ({}), capture: async () => Buffer.from('frame')
  });
  session.pause();
  const pending = session.run('click', {});
  await assert.rejects(session.run('click', {}), /queue full/);
  session.resume();
  await pending;
  for (let i = 0; i < 60; i++) await session.run('click', {});
  const snapshot = session.snapshot();
  assert.equal(snapshot.events.length, 100);
  assert.equal(snapshot.omittedEvents, 22);
  snapshot.events[0].label = 'changed';
  assert.notEqual(session.snapshot().events[0].label, 'changed');
});
