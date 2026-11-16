#!/usr/bin/env node
// VORTEX Commander: inspect existing gateway audit timings without credentials.
// Local, read-only journalctl. Output contains aggregates, never command payloads.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const usage = 'Usage: node vortex-commander/benchmark-audit.mjs [--hours=24] [--min-samples=5] [--json]';
let hours = 24;
let minSamples = 5;
let json = false;
for (const arg of process.argv.slice(2)) {
  if (arg === '--help' || arg === '-h') { console.log(usage); process.exit(0); }
  if (arg === '--json') { json = true; continue; }
  if (/^--hours=\d+$/.test(arg)) { hours = Number(arg.slice(8)); continue; }
  if (/^--min-samples=\d+$/.test(arg)) { minSamples = Number(arg.slice(14)); continue; }
  console.error('Unknown argument: ' + arg + '\n' + usage); process.exit(2);
}
if (!Number.isSafeInteger(hours) || hours < 1 || hours > 168 ||
    !Number.isSafeInteger(minSamples) || minSamples < 1 || minSamples > 10000) {
  console.error('--hours must be 1..168 and --min-samples must be 1..10000');
  process.exit(2);
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q) => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
  return {
    n: sorted.length,
    median_ms: Math.round(at(0.5) * 10) / 10,
    p95_ms: at(0.95),
    min_ms: sorted[0],
    max_ms: sorted[sorted.length - 1],
  };
}
const aggregate = new Map();
const pattern = /tools\/call\s+([\w-]+)\s+→\s+([\w-]+)\s+(success|error)\s+(\d+)\s+ms/;
const child = spawn('journalctl', [
  '--user', '-u', 'remote-mcp-gateway.service',
  '--since', hours + ' hours ago', '--no-pager', '-o', 'cat',
], { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.setEncoding('utf8');
child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-300); });

const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
for await (const line of lines) {
  const match = pattern.exec(line);
  if (!match) continue;
  const [, tool, device, status, millis] = match;
  const key = device + '\x00' + tool;
  if (!aggregate.has(key)) aggregate.set(key, { device, tool, success: [], errors: 0 });
  const row = aggregate.get(key);
  if (status === 'success') row.success.push(Number(millis));
  else row.errors++;
}
const exitCode = await new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('close', resolve);
});
if (exitCode !== 0) {
  console.error('Cannot read local gateway service journal (exit ' + exitCode + ').');
  process.exit(1);
}
const rows = [...aggregate.values()]
  .filter(x => x.success.length >= minSamples)
  .map(x => ({ device: x.device, tool: x.tool, ...summarize(x.success), errors: x.errors }))
  .sort((a, b) => a.device.localeCompare(b.device) || a.tool.localeCompare(b.tool));
const output = {
  schema: 1, hours, min_samples: minSamples, rows,
  caveat: 'Historical gateway processing duration includes tool execution and waiting; workloads differ. This is not network-only latency or ChatGPT end-to-end time.'
};
if (json) console.log(JSON.stringify(output, null, 2));
else {
  console.log('VORTEX gateway tool timings, past ' + hours + ' hours (min ' + minSamples + ' samples):');
  for (const r of rows) console.log(
    r.device.padEnd(15) + ' ' + r.tool.padEnd(23) +
    ' n=' + String(r.n).padStart(4) + ' median=' + String(r.median_ms).padStart(8) +
    'ms p95=' + String(r.p95_ms).padStart(7) + 'ms errors=' + r.errors);
  if (!rows.length) console.log('No matching metrics in the journal.');
  console.log(output.caveat);
}
