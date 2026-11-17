#!/usr/bin/env node
// Read-only VORTEX Commander Knowledge backend: localhost Caddy config only.
// No database access, no network requests, no file traversal or mutable MCP tool.
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema, CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {captureCaddy, summarizeDomain} from './knowledge-catalog.mjs';

if (process.platform !== 'linux' || process.getuid?.() === 0 ||
    process.env.VORTEX_KNOWLEDGE_ENABLED !== 'true') {
  console.error('KNOWLEDGE_DISABLED_LOCAL_OPT_IN_REQUIRED');
  process.exit(1);
}

const backend = new Server({name:'vortex-knowledge',version:'0.1.0'},
  {capabilities:{tools:{}}});
const methods = [
  {name:'list_domains',
   description:'List configured HTTP domains from the local Caddyfile (not uptime or repository proof). Read-only and sanitized.',
   inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'inspect_domain',
   description:'Inspect Caddy route kinds, path matchers and loopback service ports for one configured domain, without configuration secrets.',
   inputSchema:{type:'object',properties:{domain:{type:'string',minLength:1,maxLength:253}},required:['domain'],additionalProperties:false}},
];
backend.setRequestHandler(ListToolsRequestSchema, async () => ({tools:methods}));
backend.setRequestHandler(CallToolRequestSchema, async request => {
  const name=request.params.name;
  const args=request.params.arguments ?? {};
  if (name!=='list_domains' && name!=='inspect_domain')
    return {isError:true,content:[{type:'text',text:'UNKNOWN_KNOWLEDGE_TOOL'}]};
  try {
    if (!args || typeof args !== 'object' || Array.isArray(args) ||
      Object.keys(args).some(k => name==='list_domains' || k!=='domain'))
      throw Error('INVALID_ARGUMENTS');
    if (name==='inspect_domain' && (typeof args.domain!=='string' || args.domain.length>253))
      throw Error('INVALID_DOMAIN');
    const data=captureCaddy();
    const response=name==='list_domains'
      ? {schemaVersion:data.schemaVersion,source:data.source,observedAt:data.observedAt,
         confidence:data.confidence,count:data.domains.length,domains:data.domains}
      : summarizeDomain(data,args.domain);
    return {content:[{type:'text',text:JSON.stringify(response)}]};
  } catch {
    // Caddy diagnostics can include filesystem snippets: never relay exception details.
    return {isError:true,content:[{type:'text',text:'KNOWLEDGE_READ_FAILED_OR_UNAVAILABLE'}]};
  }
});
await backend.connect(new StdioServerTransport());
