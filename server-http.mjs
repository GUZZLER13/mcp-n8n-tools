// server-http.mjs
// Serveur MCP HTTP pour exposer n8n à ChatGPT via HTTP

import dotenv from "dotenv";
import http from "http";

import {
  listWorkflows,
  getWorkflowById,
  deleteWorkflowById,
  createSimpleWorkflow,
  updateWorkflowById,
  runWorkflow,
  listExecutions,
  getExecutionById,
  stopExecutionById,
} from "./n8nClient.mjs";

dotenv.config();

// Logs de debug env
const k = process.env.N8N_API_KEY || "";
console.log("N8N_BASE_URL =", process.env.N8N_BASE_URL);
console.log("N8N_API_KEY présent ?", !!process.env.N8N_API_KEY);
console.log("N8N_API_KEY preview =", k.slice(0, 8), "...", k.slice(-8));

// -----------------------------------------------------------------------------
// Utilitaire : lecture du body JSON
// -----------------------------------------------------------------------------
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        if (!data) {
          resolve({});
          return;
        }
        const json = JSON.parse(data);
        resolve(json);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

// -----------------------------------------------------------------------------
// Wrappers MCP pour chaque tool
// -----------------------------------------------------------------------------
async function tool_list_workflows(args = {}) {
  const workflows = await listWorkflows(args);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(workflows, null, 2),
      },
    ],
    isError: false,
  };
}

async function tool_get_workflow(args = {}) {
  const { id } = args;
  if (!id) {
    return {
      content: [
        {
          type: "text",
          text: "Erreur: paramètre 'id' manquant pour get_workflow",
        },
      ],
      isError: true,
    };
  }
  const wf = await getWorkflowById(id);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(wf, null, 2),
      },
    ],
    isError: false,
  };
}

async function tool_create_workflow(args = {}) {
  const { name, active } = args;
  if (!name) {
    return {
      content: [
        {
          type: "text",
          text: "Erreur: paramètre 'name' manquant pour create_workflow",
        },
      ],
      isError: true,
    };
  }
  const wf = await createSimpleWorkflow({ name, active: !!active });
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(wf, null, 2),
      },
    ],
    isError: false,
  };
}

async function tool_update_workflow(args = {}) {
  const { id, patch, workflow } = args;
  if (!id) {
    return {
      content: [
        {
          type: "text",
          text: "Erreur: paramètre 'id' manquant pour update_workflow",
        },
      ],
      isError: true,
    };
  }
  const payload = patch || workflow;
  if (!payload || typeof payload !== "object") {
    return {
      content: [
        {
          type: "text",
          text:
            "Erreur: paramètre 'patch' ou 'workflow' (objet) requis pour update_workflow",
        },
      ],
      isError: true,
    };
  }
  const wf = await updateWorkflowById(id, payload);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(wf, null, 2),
      },
    ],
    isError: false,
  };
}

async function tool_delete_workflow(args = {}) {
  const { id } = args;
  if (!id) {
    return {
      content: [
        {
          type: "text",
          text: "Erreur: paramètre 'id' manquant pour delete_workflow",
        },
      ],
      isError: true,
    };
  }
  const result = await deleteWorkflowById(id);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    isError: false,
  };
}

async function tool_run_workflow(args = {}) {
  const { id, payload, mode } = args;
  if (!id) {
    return {
      content: [
        {
          type: "text",
          text: "Erreur: paramètre 'id' manquant pour run_workflow",
        },
      ],
      isError: true,
    };
  }
  const result = await runWorkflow(id, { payload, mode });
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    isError: false,
  };
}

async function tool_list_executions(args = {}) {
  const result = await listExecutions(args);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    isError: false,
  };
}

async function tool_get_execution(args = {}) {
  const { id } = args;
  if (!id) {
    return {
      content: [
        {
          type: "text",
          text: "Erreur: paramètre 'id' manquant pour get_execution",
        },
      ],
      isError: true,
    };
  }
  const result = await getExecutionById(id);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    isError: false,
  };
}

async function tool_stop_execution(args = {}) {
  const { id } = args;
  if (!id) {
    return {
      content: [
        {
          type: "text",
          text: "Erreur: paramètre 'id' manquant pour stop_execution",
        },
      ],
      isError: true,
    };
  }
  const result = await stopExecutionById(id);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    isError: false,
  };
}

// -----------------------------------------------------------------------------
// Serveur MCP HTTP (JSON-RPC 2.0)
// -----------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  let request;
  try {
    request = await readJsonBody(req);
    console.log("Requête MCP reçue:", JSON.stringify(request, null, 2));
  } catch (err) {
    console.error("Erreur lecture body:", err);
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Bad request" }));
    return;
  }

  const { id, method, params } = request || {};

  const baseResponse = {
    jsonrpc: "2.0",
    id,
  };

  try {
    // -------------------------------------------------------------------------
    // initialize
    // -------------------------------------------------------------------------
    if (method === "initialize") {
      const clientProtocolVersion =
        params?.protocolVersion || "2025-06-18";

      const result = {
        protocolVersion: clientProtocolVersion,
        capabilities: {
          tools: {
            listChanged: true,
          },
        },
        serverInfo: {
          name: "n8n-mcp-server",
          version: "1.0.0",
        },
      };

      const response = { ...baseResponse, result };
      console.log(
        "Réponse MCP envoyée:",
        JSON.stringify(response, null, 2)
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }

    // -------------------------------------------------------------------------
    // notifications/initialized
    // -------------------------------------------------------------------------
    if (method === "notifications/initialized") {
      const response = {
        jsonrpc: "2.0",
        id: null,
        result: null,
      };
      console.log(
        "Réponse MCP envoyée (notification ack):",
        JSON.stringify(response, null, 2)
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }

    // -------------------------------------------------------------------------
    // tools/list : déclare tous les tools au client MCP
    // -------------------------------------------------------------------------
    if (method === "tools/list") {
      const result = {
        tools: [
          {
            name: "list_workflows",
            description:
              "Liste les workflows n8n (id, nom, état, dates).",
            inputSchema: {
              type: "object",
              properties: {
                search: {
                  type: "string",
                  description: "Filtre sur le nom du workflow",
                },
                activeOnly: {
                  type: "boolean",
                  description: "Filtrer uniquement les workflows actifs",
                },
                limit: {
                  type: "number",
                  description: "Limiter le nombre de résultats",
                },
              },
              required: [],
            },
          },
          {
            name: "get_workflow",
            description:
              "Récupère le JSON complet d’un workflow par son id.",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "ID du workflow",
                },
              },
              required: ["id"],
            },
          },
          {
            name: "create_workflow",
            description:
              "Crée un workflow n8n simple avec un Manual Trigger.",
            inputSchema: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Nom du workflow",
                },
                active: {
                  type: "boolean",
                  description: "Activer le workflow après création",
                },
              },
              required: ["name"],
            },
          },
          {
            name: "update_workflow",
            description:
              "Met à jour un workflow n8n (patch JSON ou workflow complet).",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "ID du workflow",
                },
                patch: {
                  type: "object",
                  description:
                    "Patch partiel (par ex. { active: true }) ou JSON complet.",
                },
                workflow: {
                  type: "object",
                  description:
                    "Alternative à patch: workflow complet à envoyer.",
                },
              },
              required: ["id"],
            },
          },
          {
            name: "delete_workflow",
            description:
              "Supprime un workflow n8n par son ID.",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "ID du workflow à supprimer",
                },
              },
              required: ["id"],
            },
          },
          {
            name: "run_workflow",
            description:
              "Exécute un workflow n8n par son ID (API /api/v1/workflows/:id/run).",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "ID du workflow à exécuter",
                },
                payload: {
                  type: "object",
                  description:
                    "Données à injecter dans le workflow (optionnel)",
                },
                mode: {
                  type: "string",
                  description: "Mode d'exécution (ex: 'manual')",
                },
              },
              required: ["id"],
            },
          },
          {
            name: "list_executions",
            description:
              "Liste les exécutions n8n (filtrable par workflow, status, limit).",
            inputSchema: {
              type: "object",
              properties: {
                workflowId: {
                  type: "string",
                  description: "Filtrer par ID de workflow",
                },
                status: {
                  type: "string",
                  description:
                    "Filtrer par statut (ex: success, error, waiting)",
                },
                limit: {
                  type: "number",
                  description: "Limiter le nombre de résultats",
                },
              },
              required: [],
            },
          },
          {
            name: "get_execution",
            description:
              "Récupère les détails d’une exécution par ID.",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "ID de l'exécution",
                },
              },
              required: ["id"],
            },
          },
          {
            name: "stop_execution",
            description:
              "Stoppe une exécution n8n par son ID.",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "ID de l'exécution à stopper",
                },
              },
              required: ["id"],
            },
          },
        ],
      };

      const response = { ...baseResponse, result };
      console.log(
        "Réponse MCP envoyée (tools/list):",
        JSON.stringify(response, null, 2)
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }

    // -------------------------------------------------------------------------
    // tools/call
    // -------------------------------------------------------------------------
    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};
      console.log("Appel outil:", toolName, "avec args:", args);

      let toolResult;

      if (toolName === "list_workflows") {
        toolResult = await tool_list_workflows(args);
      } else if (toolName === "get_workflow") {
        toolResult = await tool_get_workflow(args);
      } else if (toolName === "create_workflow") {
        toolResult = await tool_create_workflow(args);
      } else if (toolName === "update_workflow") {
        toolResult = await tool_update_workflow(args);
      } else if (toolName === "delete_workflow") {
        toolResult = await tool_delete_workflow(args);
      } else if (toolName === "run_workflow") {
        toolResult = await tool_run_workflow(args);
      } else if (toolName === "list_executions") {
        toolResult = await tool_list_executions(args);
      } else if (toolName === "get_execution") {
        toolResult = await tool_get_execution(args);
      } else if (toolName === "stop_execution") {
        toolResult = await tool_stop_execution(args);
      } else {
        const response = {
          ...baseResponse,
          error: {
            code: -32601,
            message: `Tool not found: ${toolName}`,
          },
        };
        console.log(
          "Réponse MCP envoyée (outil inconnu):",
          JSON.stringify(response, null, 2)
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
        return;
      }

      const response = {
        ...baseResponse,
        result: toolResult,
      };

      console.log(
        "Réponse MCP envoyée:",
        JSON.stringify(response, null, 2)
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }

    // -------------------------------------------------------------------------
    // Méthode inconnue
    // -------------------------------------------------------------------------
    const response = {
      ...baseResponse,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    };
    console.log(
      "Réponse MCP envoyée (méthode inconnue):",
      JSON.stringify(response, null, 2)
    );
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  } catch (err) {
    console.error("Erreur serveur MCP:", err);
    const response = {
      ...baseResponse,
      error: {
        code: -32603,
        message: "Internal error",
        data: String(err),
      },
    };
    console.log(
      "Réponse MCP envoyée (erreur interne):",
      JSON.stringify(response, null, 2)
    );
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  }
});

const PORT = 3333;
server.listen(PORT, () => {
  console.log(`MCP HTTP server listening on http://localhost:${PORT}/mcp`);
});
