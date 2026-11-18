// VORTEX native RACINES tools. Certificates stay on the VPS, never in MCP
// inputs/outputs or the family website. Intended for a separate OS service
// principal: do not run with privileged terminal/browser permissions.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const configFile = path.join(os.homedir(), '.config', 'vortex-commander', 'racines-mtls.json');
const validPerson = s => typeof s === 'string' && s.length >= 1 && s.length <= 100 && !s.includes('/');
const privateFile = name => {
  if (typeof name !== 'string' || !path.isAbsolute(name)) throw Error('Invalid private file path');
  const stat = fs.statSync(name);
  if (!stat.isFile() || (stat.mode & 0o077)) throw Error('Private file permissions must be 0600');
  return fs.readFileSync(name);
};
function readConfig() {
  const settings = JSON.parse(privateFile(configFile).toString('utf8'));
  if (
    !settings ||
    settings.servername !== 'racines-vortex.internal' ||
    !Number.isInteger(settings.port) ||
    settings.port < 1024 ||
    settings.port > 65535
  )
    throw Error('RACINES mTLS configuration invalid');
  return {
    port: settings.port,
    ca: privateFile(settings.ca),
    cert: privateFile(settings.cert),
    key: privateFile(settings.key)
  };
}

async function requestRead(apiPath) {
  const cfg = readConfig();
  return await new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: '127.0.0.1',
        port: cfg.port,
        servername: 'racines-vortex.internal',
        path: apiPath,
        method: 'GET',
        ca: cfg.ca,
        cert: cfg.cert,
        key: cfg.key,
        rejectUnauthorized: true,
        timeout: 12000,
        headers: { accept: 'application/json' }
      },
      response => {
        const parts = [];
        let bytes = 0;
        response.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > 2_000_000) response.destroy(Error('RACINES response too large'));
          else parts.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          try {
            const result = JSON.parse(Buffer.concat(parts).toString('utf8'));
            if (response.statusCode !== 200)
              throw Error('RACINES returned ' + response.statusCode);
            resolve(result);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    request.on('timeout', () => request.destroy(Error('RACINES request timed out')));
    request.on('error', reject);
    request.end();
  });
}

const tools = [
  {
    name: 'list_families',
    description: 'Liste seulement les familles RACINES autorisées pour le service VORTEX.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} }
  },
  {
    name: 'find_people',
    description: 'Recherche des personnes dans une famille autorisée RACINES, maximum 20 résultats.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['familyId', 'query'],
      properties: {
        familyId: { type: 'string', description: 'UUID de famille autorisée' },
        query: { type: 'string', minLength: 2, maxLength: 80 }
      }
    }
  },
  {
    name: 'get_research_dossier',
    description: 'Lit le dossier RACINES officiel : fiche, relations, notes, sources, recherches et documents associés. Lecture seule.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['familyId', 'personId'],
      properties: {
        familyId: { type: 'string', description: 'UUID de famille autorisée' },
        personId: { type: 'string', description: 'Identifiant canonique de personne' },
        before: {
          type: 'string',
          description: 'Pour lire les recherches précédentes, reprendre researchNextCursor.'
        }
      }
    }
  }
];

const server = new Server(
  { name: 'vortex-racines-reader', version: '0.1.0' },
  { capabilities: { tools: {} } }
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args = {} } = request.params;
  const known = tools.find(x => x.name === name);
  if (!known || !args || typeof args !== 'object' || Array.isArray(args) ||
      Object.keys(args).some(k => !Object.hasOwn(known.inputSchema.properties, k)))
    return { isError: true, content: [{ type: 'text', text: 'Outil ou paramètres refusés.' }] };
  try {
    let apiPath;
    if (name === 'list_families') apiPath = '/v1/families';
    else {
      if (!UUID.test(args.familyId)) throw Error('Invalid family ID');
      if (name === 'find_people') {
        if (typeof args.query !== 'string' || args.query.trim().length < 2 ||
            args.query.length > 80) throw Error('Invalid search');
        apiPath = '/v1/families/' + args.familyId + '/people?q=' +
          encodeURIComponent(args.query.trim());
      } else {
        if (!validPerson(args.personId)) throw Error('Invalid person ID');
        apiPath = '/v1/families/' + args.familyId + '/people/' +
          encodeURIComponent(args.personId) + '/research-dossier';
        if (args.before !== undefined) {
          if (typeof args.before !== 'string' || !UUID.test(args.before))
            throw Error('Invalid research cursor');
          apiPath += '?before=' + encodeURIComponent(args.before);
        }
      }
    }
    const data = await requestRead(apiPath);
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  } catch {
    // Never return filesystem paths, TLS material or private connection details.
    return {
      isError: true,
      content: [{ type: 'text', text: 'Consultation RACINES indisponible ou non autorisée.' }]
    };
  }
});
await server.connect(new StdioServerTransport());
