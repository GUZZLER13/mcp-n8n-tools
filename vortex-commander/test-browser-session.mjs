import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserSession } from './browser-session.mjs';

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
