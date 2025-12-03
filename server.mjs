// server.mjs — entrypoint STDIO
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createN8nMcpServer } from './mcpServer.mjs';

// Création du serveur MCP n8n
const server = createN8nMcpServer();

// Transport STDIO (pour utilisation en mode local / CLI / outils MCP stdio)
const transport = new StdioServerTransport();

// Connexion
await server.connect(transport);

console.log('n8n MCP server (stdio) en cours d’exécution');
