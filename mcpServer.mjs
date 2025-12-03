// mcpServer.mjs
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  listWorkflows,
  getWorkflowById,
  deleteWorkflowById,
  createSimpleWorkflow,
  updateWorkflowById,
} from './n8nClient.mjs';

export function createN8nMcpServer() {
  const server = new McpServer({
    name: 'n8n-mcp-server',
    version: '1.0.0',
  });

  // Tool: list_workflows (aucun paramètre utile)
  server.registerTool(
    'list_workflows',
    {
      title: 'Lister les workflows n8n',
      description: 'Retourne la liste des workflows n8n (id, nom, état).',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    async () => {
      const workflows = await listWorkflows();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(workflows, null, 2),
          },
        ],
      };
    },
  );

  // Tool: get_workflow
  server.registerTool(
    'get_workflow',
    {
      title: 'Récupérer un workflow n8n',
      description: 'Récupère le JSON complet d’un workflow par son id.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'ID du workflow n8n à récupérer',
          },
        },
        required: ['id'],
        additionalProperties: false,
      },
    },
    async ({ input }) => {
      const { id } = input;
      const wf = await getWorkflowById(id);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(wf, null, 2),
          },
        ],
      };
    },
  );

  // Tool: create_workflow
  server.registerTool(
    'create_workflow',
    {
      title: 'Créer un workflow n8n simple',
      description: "Crée un workflow n8n simple d'exemple.",
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Nom du workflow à créer',
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
    async ({ input }) => {
      const { name } = input;
      const wf = await createSimpleWorkflow(name);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(wf, null, 2),
          },
        ],
      };
    },
  );

  // Tool: update_workflow
  server.registerTool(
    'update_workflow',
    {
      title: 'Mettre à jour un workflow n8n',
      description: 'Met à jour un workflow n8n en envoyant un JSON complet.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'ID du workflow à mettre à jour',
          },
          workflow: {
            type: 'object',
            description: 'Objet workflow complet à envoyer à n8n',
          },
        },
        required: ['id', 'workflow'],
        additionalProperties: false,
      },
    },
    async ({ input }) => {
      const { id, workflow } = input;
      const wf = await updateWorkflowById(id, workflow);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(wf, null, 2),
          },
        ],
      };
    },
  );

  // Tool: delete_workflow
  server.registerTool(
    'delete_workflow',
    {
      title: 'Supprimer un workflow n8n',
      description: 'Supprime un workflow n8n par son ID.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'ID du workflow à supprimer',
          },
        },
        required: ['id'],
        additionalProperties: false,
      },
    },
    async ({ input }) => {
      const { id } = input;
      const result = await deleteWorkflowById(id);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  return server;
}
