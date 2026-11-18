// Stable, native business tools: advertised even while the reader is offline.
// Routing is fixed to this isolated service; user device selection is irrelevant.
export const RACINES_DEVICE = 'racines-reader';
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const familyId = { type: 'string', description: 'UUID returned by racines_list_families.' };
export const RACINES_NATIVE_TOOLS = [
  {
    name: 'racines_list_families',
    description: 'RACINES : lister les familles autorisées avant une recherche généalogique. Accès direct à la base courante, sans Chrome, connexion manuelle ni choix de machine. Lecture seule.',
    annotations,
    inputSchema: { type: 'object', additionalProperties: false, properties: {} }
  },
  {
    name: 'racines_find_people',
    description: 'RACINES : retrouver une personne par prénom ou nom dans une famille autorisée. Renvoie ses identifiants et versions actuels (20 résultats maximum, hasMore si la recherche doit être précisée). Utiliser ensuite racines_get_research_dossier.',
    annotations,
    inputSchema: { type: 'object', additionalProperties: false, required: ['familyId', 'query'], properties: { familyId, query: { type: 'string', minLength: 2, maxLength: 80 } } }
  },
  {
    name: 'racines_get_research_dossier',
    description: 'RACINES : lire la fiche actuelle, ses liens familiaux, notes, références de preuves, documents associés, propositions et recherches précédentes. Réponse PostgreSQL avec version et empreinte. Les documents sont des métadonnées : les scans R2 ne sont pas téléchargés. Préserver les incertitudes et suivre researchNextCursor avec before pour le journal plus ancien.',
    annotations,
    inputSchema: { type: 'object', additionalProperties: false, required: ['familyId', 'personId'], properties: { familyId, personId: { type: 'string', minLength: 1, maxLength: 100 }, before: { type: 'string', description: 'Curseur researchNextCursor de la page précédente.' } } }
  }
];
export const RACINES_TOOL_NAMES = new Set(RACINES_NATIVE_TOOLS.map(tool => tool.name));
export const withRacinesTools = tools => [
  ...tools.filter(tool => !RACINES_TOOL_NAMES.has(tool.name)),
  ...RACINES_NATIVE_TOOLS
];
