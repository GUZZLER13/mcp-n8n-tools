// Caddy-first, read-only architecture discovery. No secrets or Caddy config
// contents leave the host: return only allowlisted host/path/handler/loopback target.
import {execFileSync} from 'node:child_process';

const CADDY = '/usr/bin/caddy';
const CONFIG = '/etc/caddy/Caddyfile';
const ALLOWED_HOST = /^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;
const ALLOWED_PATH = /^\/[a-zA-Z0-9_.*\/:-]{0,179}$/;

function safeHosts(matchers, fallback) {
  const hosts = new Set();
  for (const matcher of Array.isArray(matchers) ? matchers : []) {
    for (const raw of Array.isArray(matcher?.host) ? matcher.host : []) {
      if (typeof raw !== 'string') continue;
      const h = raw.toLowerCase();
      if (ALLOWED_HOST.test(h) && !h.includes('..')) hosts.add(h);
    }
  }
  return hosts.size ? [...hosts].sort() : fallback;
}
function safePaths(matchers, fallback) {
  const paths = new Set();
  for (const matcher of Array.isArray(matchers) ? matchers : []) {
    for (const value of Array.isArray(matcher?.path) ? matcher.path : []) {
      if (typeof value === 'string' && ALLOWED_PATH.test(value)) paths.add(value);
    }
  }
  return paths.size ? [...paths].sort().slice(0, 40) : fallback;
}
function safeUpstreams(handler) {
  const result = new Set();
  for (const entry of Array.isArray(handler?.upstreams) ? handler.upstreams : []) {
    const dial = entry?.dial;
    if (typeof dial !== 'string') continue;
    const m = dial.match(/^(127\.0\.0\.1|localhost|\[::1\]):([0-9]{1,5})$/);
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 65535) {
      result.add('loopback:' + m[2]);
    } else {
      result.add('external_or_socket_redacted');
    }
  }
  return [...result].sort().slice(0, 20);
}

export function catalogFromAdapted(config, observedAt = new Date().toISOString()) {
  if (!config || typeof config !== 'object') throw Error('CADDY_INVALID_DOCUMENT');
  const servers = config?.apps?.http?.servers;
  if (!servers || typeof servers !== 'object') throw Error('CADDY_HTTP_SERVERS_MISSING');
  if (!Number.isFinite(Date.parse(observedAt))) throw Error('INVALID_OBSERVATION_TIME');
  const records = [];
  const walk = (routes, inheritedHosts = [], inheritedPaths = [], depth = 0) => {
    if (depth > 15) throw Error('CADDY_ROUTE_DEPTH_LIMIT');
    if (!Array.isArray(routes)) return;
    for (const route of routes) {
      const hosts = safeHosts(route?.match, inheritedHosts);
      const paths = safePaths(route?.match, inheritedPaths);
      for (const handle of Array.isArray(route?.handle) ? route.handle : []) {
        const kind = handle?.handler;
        if (hosts.length && ['reverse_proxy', 'file_server', 'static_response'].includes(kind)) {
          for (const domain of hosts) {
            const entry = {domain, paths:paths.length ? paths : ['/'], kind,
              ...(kind === 'reverse_proxy' ? {targets:safeUpstreams(handle)} : {})};
            records.push(entry);
          }
        }
        if (handle?.routes) walk(handle.routes, hosts, paths, depth + 1);
      }
      if (route?.routes) walk(route.routes, hosts, paths, depth + 1);
      if (records.length > 4000) throw Error('CADDY_ROUTE_COUNT_LIMIT');
    }
  };
  for (const server of Object.values(servers)) walk(server?.routes);
  // Deduplicate equivalent routes and provide deterministic ordering.
  const dedup = new Map(records.map(x => [JSON.stringify(x), x]));
  const routes = [...dedup.values()].sort((a,b) =>
    (a.domain + '|' + a.kind + '|' + a.paths.join(',')).localeCompare(
      b.domain + '|' + b.kind + '|' + b.paths.join(',')));
  const domains = [...new Set(routes.map(x => x.domain))].sort();
  return {
    schemaVersion:1, source:{type:'caddy_adapt', config:'/etc/caddy/Caddyfile', device:'vps-hetzner'},
    observedAt, confidence:'configured_not_health_checked', domains, routes
  };
}

export function captureCaddy() {
  if (process.platform !== 'linux') throw Error('CADDY_LINUX_REQUIRED');
  // No shell, network, env-provided file, untrusted adapter or raw config export.
  // Fixed trusted executable and file; never print stderr (may contain secrets).
  const raw = execFileSync(CADDY, ['adapt','--config',CONFIG,'--adapter','caddyfile'], {
    encoding:'utf8', timeout:15000, maxBuffer:8*1024*1024,
    stdio:['ignore','pipe','pipe']
  });
  return catalogFromAdapted(JSON.parse(raw));
}

export function summarizeDomain(catalog, domain) {
  if (typeof domain !== 'string' || !ALLOWED_HOST.test(domain.toLowerCase())) throw Error('INVALID_DOMAIN');
  const normalized = domain.toLowerCase();
  const matches = catalog.routes.filter(r => r.domain === normalized);
  if (!matches.length) return {domain:normalized, status:'not_found_in_caddy', observedAt:catalog.observedAt};
  return {domain:normalized, status:'configured_not_health_checked',
    observedAt:catalog.observedAt, source:catalog.source, routes:matches};
}
