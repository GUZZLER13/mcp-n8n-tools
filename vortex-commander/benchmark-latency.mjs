#!/usr/bin/env node
// VORTEX Commander read-only latency benchmark (local VPS gateway).
// No cloud calls, no secrets printed, no service changes. Node.js >= 18.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const usage = [
  'Usage: node vortex-commander/benchmark-latency.mjs [--samples=5] [--exec] [--json]',
  '  Default: gateway health, devices_list and per-device tools_list.',
  '  --exec: additionally run non-privileged "whoami" via each connected agent.',
  '  --json: structured summary without payloads or credentials.',
  '  Run on VPS as the paired non-root user; gateway is fixed to localhost.'
].join('\n');

let samples = 5;
let exec = false;
let json = false;
for (const arg of process.argv.slice(2)) {
  if (arg === '--help' || arg === '-h') { console.log(usage); process.exit(0); }
  if (arg === '--exec') { exec = true; continue; }
  if (arg === '--json') { json = true; continue; }
  if (/^--samples=\d+$/.test(arg)) { samples = Number(arg.slice(10)); continue; }
  console.error('Unknown argument: ' + arg + '\n' + usage);
  process.exit(2);
}
if (!Number.isSafeInteger(samples) || samples < 2 || samples > 30) {
  console.error('--samples must be between 2 and 30');
  process.exit(2);
}

const origin = 'http://127.0.0.1:8766';
const tokenPath = path.join(os.homedir(), 'remote-mcp', 'secrets', 'owner-token');
let token;
try { token = fs.readFileSync(tokenPath, 'utf8').trim(); }
catch { console.error('Local gateway credential unavailable; run as the paired VPS account.'); process.exit(2); }
if (!token) { console.error('Local gateway credential is empty.'); process.exit(2); }
let sid;
let nextId = 1;

async function rpc(method, params = {}) {
  const response = await fetch(origin + '/mcp', {
    method: 'POST',
    headers: {
      'authorization': 'Bearer ' + token,
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream',
      ...(sid ? { 'mcp-session-id': sid } : {})
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error('MCP HTTP ' + response.status);
  sid = response.headers.get('mcp-session-id') || sid;
  const payload = await response.json();
  if (payload.error) throw new Error('MCP JSON-RPC error');
  return payload.result;
}

function unpack(result) {
  const value = result?.content?.find(x => x.type === 'text')?.text;
  if (!value || result.isError) throw new Error('Tool call failed');
  try { return JSON.parse(value); } catch { throw new Error('Non-JSON tool response'); }
}

function stats(label, measurements, errors) {
  const sorted = [...measurements].sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
  return {
    metric: label,
    ok: sorted.length,
    errors,
    median_ms: sorted.length ? Math.round(percentile(0.5) * 10) / 10 : null,
    p95_ms: sorted.length ? Math.round(percentile(0.95) * 10) / 10 : null,
    min_ms: sorted.length ? Math.round(sorted[0] * 10) / 10 : null
  };
}
async function measure(label, count, action) {
  const values = [];
  let errors = 0;
  for (let i = 0; i < count; i++) {
    const t = performance.now();
    try { await action(); values.push(performance.now() - t); }
    catch { errors++; }
  }
  return stats(label, values, errors);
}
async function benchmark() {
  // Validate the connection before measuring; startup/authentication are excluded.
  const healthResponse = await fetch(origin + '/health', { signal: AbortSignal.timeout(10000) });
  if (!healthResponse.ok) throw new Error('Local gateway health failed: ' + healthResponse.status);
  await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'vortex-latency-benchmark', version: '1' }
  });
  const registered = unpack(await rpc('tools/call', { name: 'devices_list', arguments: {} }));
  if (!Array.isArray(registered)) throw new Error('Unexpected devices_list result');
  const online = registered.filter(d => d.status === 'online' && typeof d.device_id === 'string');
  const metrics = [
    await measure('gateway_health', samples, async () => {
      const r = await fetch(origin + '/health', { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error('Health failed');
      await r.arrayBuffer();
    }),
    await measure('gateway_devices_list', samples, async () => {
      unpack(await rpc('tools/call', { name: 'devices_list', arguments: {} }));
    })
  ];
  // Independent devices may be measured concurrently; one command per device at a time.
  const byDevice = await Promise.all(online.map(async d => {
    const device = d.device_id;
    const rows = [await measure('tools_list', samples, async () => {
      unpack(await rpc('tools/call', {
        name: 'tools_list', arguments: { device_id: device }
      }));
    })];
    if (exec) {
      rows.push(await measure('whoami_ack', samples, async () => {
        const result = await rpc('tools/call', {
          name: 'tool_call',
          arguments: { device_id: device, name: 'start_process',
            arguments: { command: 'whoami', timeout_ms: 10000 } }
        });
        if (result?.isError || !result?.content?.length) throw new Error('Remote command failed');
      }));
    }
    return { device_id: device, metrics: rows };
  }));
  return {
    schema: 1,
    measured_at: new Date().toISOString(),
    samples_per_metric: samples,
    executable_test: exec,
    online_devices: online.length,
    known_devices: registered.length,
    metrics,
    devices: byDevice,
    note: 'Round-trip from VPS to local gateway; excludes ChatGPT processing and public Internet. whoami_ack measures command acknowledgement, not full process completion.'
  };
}

try {
  const result = await benchmark();
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('VORTEX latency: ' + result.online_devices + '/' + result.known_devices +
      ' online; ' + samples + ' samples per metric. Times in milliseconds.');
    const show = (name, m) => console.log(
      name.padEnd(34) + 'median=' + String(m.median_ms ?? '-').padStart(8) +
      '  p95=' + String(m.p95_ms ?? '-').padStart(8) +
      '  ok=' + m.ok + ' errors=' + m.errors);
    for (const metric of result.metrics) show(metric.metric, metric);
    for (const device of result.devices) {
      for (const metric of device.metrics) show(device.device_id + ' / ' + metric.metric, metric);
    }
    console.log(result.note);
  }
  const failures = [...result.metrics, ...result.devices.flatMap(x => x.metrics)]
    .some(m => m.errors || m.ok === 0);
  if (failures) process.exitCode = 1;
} catch (err) {
  // Only a short diagnostic, never token, request headers or response payloads.
  console.error('VORTEX benchmark failed: ' + (err instanceof Error ? err.message : 'unknown error'));
  process.exitCode = 1;
} finally {
  if (sid) try {
    await fetch(origin + '/mcp', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ' + token, 'mcp-session-id': sid },
      signal: AbortSignal.timeout(4000)
    });
  } catch {}
}
