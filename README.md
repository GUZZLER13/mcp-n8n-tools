
## Description

**mcp-n8n-tools** est un serveur **MCP (Model Context Protocol)** permettant d’exposer une instance **n8n self-hosted** à des clients compatibles MCP — notamment **ChatGPT** — via une interface **MCP HTTP**.  
Il offre une couche d’intégration complète pour interagir directement avec l’API n8n : consultation, modification, exécution et supervision de workflows, le tout à distance et de manière sécurisée.

Grâce à cette passerelle, un assistant IA comme ChatGPT peut piloter n8n en temps réel, déclencher des workflows, analyser des exécutions, et orchestrer des automations complexes, que ce soit en local ou via un tunnel Cloudflare.

---

## Sommaire

- [Présentation](#présentation)
- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Configuration](#configuration)
- [Lancement en local](#lancement-en-local)
- [Utilisation avec ChatGPT](#utilisation-avec-chatgpt)
- [Structure du projet](#structure-du-projet)
- [Outils MCP exposés](#outils-mcp-exposés)

---

## Présentation

`mcp-n8n-tools` est un serveur MCP qui expose une instance n8n via une API HTTP JSON-RPC compatible avec le protocole Model Context Protocol (MCP).

L’objectif principal est de permettre à des clients MCP (comme ChatGPT) de :

- Lister et gérer les workflows n8n
- Lancer des exécutions
- Consulter et gérer les exécutions

---

## Fonctionnalités

- Liste des workflows n8n
- Récupération d’un workflow par ID
- Création de workflows simples
- Mise à jour de workflows
- Suppression de workflows
- Exécution de workflows avec payload
- Liste des exécutions
- Récupération d’une exécution
- Arrêt d’une exécution

---

## Architecture

Côté n8n :

- Instance self-hosted accessible sur :  
  `https://n8n.guzzler-bot.cloud`
- Authentification par clé API n8n (`X-N8N-API-KEY`)

Côté projet Node :

- `n8nClient.mjs` : client HTTP vers l’API n8n
- `server-http.mjs` : serveur MCP HTTP (JSON-RPC 2.0) exposant les tools MCP
- `server.mjs` + `mcpServer.mjs` : serveur MCP STDIO basé sur le SDK officiel (optionnel, pour d’autres clients MCP)

---

## Prérequis

- Node.js (version 18+ recommandée)
- Accès à une instance n8n (ex. : `https://n8n.guzzler-bot.cloud`)
- Clé API n8n valide
- (Optionnel) Cloudflare Tunnel pour exposer le serveur MCP au public (ex. pour ChatGPT)

---

## Installation

Cloner le projet (ou le récupérer depuis Git) :
git clone <URL_DU_DEPOT> mcp-n8n-tools
cd mcp-n8n-tools

Installer les dépendances :
npm install

Configuration
Créer un fichier .env à la racine du projet (non committé) à partir de .env.example :
N8N_BASE_URL=https://n8n.guzzler-bot.cloud
N8N_API_KEY=VOTRE_CLE_API_N8N

Un fichier .env.example est fourni :
N8N_BASE_URL=https://n8n.guzzler-bot.cloud
N8N_API_KEY=REMPLACER_PAR_VOTRE_CLE_API_N8N

Le chargement des variables d’environnement est fait via dotenv dans les fichiers serveurs.

Lancement en local
1. Lancer le serveur MCP HTTP
Dans le répertoire du projet :
npm start

Par défaut, server-http.mjs démarre un serveur HTTP JSON-RPC sur :
http://localhost:3333/mcp

Tu peux vérifier qu’il répond avec un simple curl (exemple JSON-RPC minimal) ou via un client MCP.

2. Exposer le serveur via Cloudflare (optionnel, pour ChatGPT)
Si tu veux connecter ce serveur à ChatGPT, tu peux utiliser Cloudflare Tunnel :
cloudflared tunnel --url http://localhost:3333

Cloudflare fournit alors une URL publique de type :
https://xxxxxxxx.trycloudflare.com

Le serveur MCP sera alors accessible sur :
https://xxxxxxxx.trycloudflare.com/mcp
Note : tant que cloudflared tourne, cette URL reste active.

Utilisation avec ChatGPT
Lancer le serveur MCP HTTP :
npm start

Lancer le tunnel Cloudflare :
cloudflared tunnel --url http://localhost:3333

Récupérer l’URL Cloudflare, par exemple :
https://xxxxxxxx.trycloudflare.com/mcp

Dans ChatGPT (ou tout autre client MCP HTTP) :
Ajouter un nouveau serveur MCP HTTP
URL du serveur MCP : https://xxxxxxxx.trycloudflare.com/mcp

Utiliser les tools MCP directement depuis ChatGPT :

list_workflows
get_workflow
create_workflow
update_workflow
delete_workflow
run_workflow
list_executions
get_execution
stop_execution

Exemple d’appel MCP / JSON-RPC pour lister les workflows :

{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/call",
  "params": {
    "tool": "list_workflows",
    "arguments": {}
  }
}


Structure du projet

mcp-n8n-tools/
 ├── n8nClient.mjs        # Client HTTP générique vers l'API n8n
 ├── server-http.mjs      # Serveur MCP HTTP (JSON-RPC 2.0)
 ├── server.mjs           # Serveur MCP STDIO (optionnel)
 ├── mcpServer.mjs        # Implémentation serveur MCP via le SDK
 ├── package.json
 ├── .env.example         # Exemple de configuration
 ├── .gitignore
 └── README.md


Outils MCP exposés

La méthode tools/list expose les outils suivants au client MCP :

list_workflows
get_workflow
create_workflow
update_workflow
delete_workflow
run_workflow
list_executions
get_execution
stop_execution

Chaque tool route vers les fonctions de n8nClient.mjs :

listWorkflows
getWorkflowById
createSimpleWorkflow
updateWorkflowById
deleteWorkflowById
runWorkflow
listExecutions
getExecutionById
stopExecutionById

⚠️ Cette URL n'expose aucune API sans authentification.
Toutes les opérations nécessitent une clé API privée qui n'est pas incluse dans ce dépôt.
