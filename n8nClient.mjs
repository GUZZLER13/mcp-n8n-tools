// n8nClient.mjs

// URL de base n8n (sans /api/v1 à la fin)
const N8N_BASE_URL =
  process.env.N8N_BASE_URL?.replace(/\/+$/, "") ||
  "https://n8n.guzzler-bot.cloud";

const N8N_API_KEY = process.env.N8N_API_KEY;

// Appel générique à l’API n8n
async function callN8N(path, options = {}) {
  if (!N8N_API_KEY) {
    throw new Error("La variable d'environnement N8N_API_KEY n'est pas définie.");
  }

  const url = `${N8N_BASE_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
    "X-N8N-API-KEY": N8N_API_KEY,
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(
      `Erreur API n8n ${res.status} ${res.statusText} sur ${url} – corps: ${bodyText}`
    );
  }

  // Certaines routes (DELETE, STOP) peuvent renvoyer un corps vide
  return res.json().catch(() => ({}));
}

/**
 * Liste les workflows, avec un format “propre” pour l’IA.
 * options:
 *   - search (string) pour filtrer par nom
 *   - activeOnly (bool)
 *   - limit (number)
 */
export async function listWorkflows(options = {}) {
  const { search, activeOnly = false, limit } = options;

  const data = await callN8N("/api/v1/workflows");

  const rawWorkflows = Array.isArray(data.data) ? data.data : data;

  let workflows = rawWorkflows.map((wf) => ({
    id: wf.id,
    name: wf.name,
    active: !!wf.active,
    createdAt: wf.createdAt,
    updatedAt: wf.updatedAt,
  }));

  if (search && search.trim()) {
    const s = search.toLowerCase();
    workflows = workflows.filter((w) => w.name.toLowerCase().includes(s));
  }

  if (activeOnly) {
    workflows = workflows.filter((w) => w.active);
  }

  if (typeof limit === "number") {
    workflows = workflows.slice(0, limit);
  }

  return workflows;
}

// Récupère un workflow complet par ID
export async function getWorkflowById(id) {
  if (!id) throw new Error("getWorkflowById: id manquant");
  return callN8N(`/api/v1/workflows/${encodeURIComponent(id)}`);
}

// Supprime un workflow par ID
export async function deleteWorkflowById(id) {
  if (!id) throw new Error("deleteWorkflowById: id manquant");
  return callN8N(`/api/v1/workflows/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// Crée un workflow simple avec un seul node Manual Trigger
// Accepte soit un string (name), soit un objet { name, active }
export async function createSimpleWorkflow(input) {
  let name;
  let active = false;

  if (typeof input === "string") {
    name = input;
  } else if (input && typeof input === "object") {
    ({ name, active = false } = input);
  } else {
    throw new Error(
      "createSimpleWorkflow: argument requis (string name ou { name, active })"
    );
  }

  if (!name || typeof name !== "string") {
    throw new Error("createSimpleWorkflow: name (string) est requis");
  }

  const body = {
  name,
  nodes: [
    {
      parameters: {},
      name: "When clicking ‘Execute workflow’",
      type: "n8n-nodes-base.manualTrigger",
      typeVersion: 1,
      position: [0, 0],
    },
  ],
  connections: {},
  settings: {
    executionOrder: "v1",
  },
  tags: [],
};


  return callN8N("/api/v1/workflows", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Met à jour un workflow (patch partiel ou JSON complet)
export async function updateWorkflowById(id, patch = {}) {
  if (!id) throw new Error("updateWorkflowById: id manquant");
  if (!patch || typeof patch !== "object") {
    throw new Error("updateWorkflowById: patch doit être un objet");
  }

  return callN8N(`/api/v1/workflows/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// Exécute un workflow par ID
// options optionnelles : { payload, mode, query }
// - payload: données à injecter (par ex. dans le trigger)
// - mode: 'manual' | 'integrated' | ...
export async function runWorkflow(id, options = {}) {
  if (!id) throw new Error("runWorkflow: id manquant");

  const body = {};
  if (options.payload) {
    body.payload = options.payload;
  }
  if (options.mode) {
    body.mode = options.mode;
  }

  const hasBody = Object.keys(body).length > 0;

  return callN8N(`/api/v1/workflows/${encodeURIComponent(id)}/run`, {
    method: "POST",
    body: hasBody ? JSON.stringify(body) : undefined,
  });
}

// Liste les exécutions (avec filtres optionnels)
export async function listExecutions(options = {}) {
  const { workflowId, status, limit } = options;
  const params = new URLSearchParams();

  if (workflowId) params.append("workflowId", workflowId);
  if (status) params.append("status", status);
  if (typeof limit === "number") params.append("limit", String(limit));

  const query = params.toString();
  const path = `/api/v1/executions${query ? `?${query}` : ""}`;

  return callN8N(path);
}

// Récupère une exécution par ID
export async function getExecutionById(id) {
  if (!id) throw new Error("getExecutionById: id manquant");
  return callN8N(`/api/v1/executions/${encodeURIComponent(id)}`);
}

// Stoppe une exécution par ID
export async function stopExecutionById(id) {
  if (!id) throw new Error("stopExecutionById: id manquant");
  return callN8N(`/api/v1/executions/${encodeURIComponent(id)}/stop`, {
    method: "POST",
  });
}
