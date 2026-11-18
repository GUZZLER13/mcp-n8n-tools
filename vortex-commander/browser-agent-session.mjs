import { BrowserSession } from './browser-session.mjs';

const prefix = 'browser_session_';
const actions = ['status', 'pause', 'resume', 'stop'];
export const browserSessionTools = actions.map(action => ({
  name: prefix + action,
  description: {
    status: 'Consulter les étapes techniques de la session Chrome.',
    pause: 'Suspendre les prochaines actions Chrome. L’action active termine.',
    resume: 'Reprendre les actions Chrome en attente.',
    stop: 'Arrêter la session et annuler les actions Chrome en attente.'
  }[action],
  inputSchema: { type: 'object', additionalProperties: false, properties: {} }
})).concat([
  { name: prefix + 'view', description: 'Observer les onglets ou capturer la page, même pendant la pause.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['action'], properties: {
      action: { enum: ['pages', 'frame'] }, pageId: { type: 'integer', minimum: 0, maximum: 1000000 }
    } } },
  { name: prefix + 'human', description: 'Action humaine dans la page pendant la pause. Aucune reprise automatique.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['action','pageId'], properties: {
      action: { enum: ['click','type','key'] }, pageId: { type: 'integer', minimum: 0, maximum: 1000000 },
      x: { type: 'number', minimum: 0, maximum: 10000 }, y: { type: 'number', minimum: 0, maximum: 10000 },
      text: { type: 'string', minLength: 1, maxLength: 2000 },
      key: { enum: ['Enter','Tab','Shift+Tab','Escape','Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End','Control+A'] }
    } } }
]);

export function createBrowserAgentSession(execute, external = async () => { throw Error('Viewer unavailable'); }) {
  const session = new BrowserSession({
    objective: 'Session Chrome VORTEX',
    execute: (_name, payload, signal) => execute(payload, signal),
    capture: async () => { throw Error('Use authorized Chrome screenshot tool'); }
  });
  return {
    run: (route, args, timeout) => session.run(route.real, { route, args, timeout }),
    control: (name, args = {}) => {
      if (name === prefix + 'view' || name === prefix + 'human') {
        const human = name === prefix + 'human';
        if (!args || typeof args !== 'object' || Array.isArray(args) || typeof args.action !== 'string') throw Error('Invalid viewer arguments');
        const allowed = human
          ? {click:['action','pageId','x','y'],type:['action','pageId','text'],key:['action','pageId','key']}[args.action]
          : {pages:['action'],frame:['action','pageId']}[args.action];
        if (!allowed || Object.keys(args).length !== allowed.length || Object.keys(args).some(k => !allowed.includes(k)))
          throw Error('Invalid viewer action');
        if (allowed.includes('pageId') && (!Number.isInteger(args.pageId) || args.pageId < 0 || args.pageId > 1000000))
          throw Error('Invalid viewer page');
        let tool, params;
        const {pageId} = args;
        if (human) {
          if (args.action === 'click') {
            if (![args.x,args.y].every(n => Number.isFinite(n) && n >= 0 && n <= 10000)) throw Error('Invalid coordinates');
            tool = 'click_at'; params = {pageId,x:args.x,y:args.y};
          } else if (args.action === 'type') {
            if (typeof args.text !== 'string' || !args.text.length || args.text.length > 2000) throw Error('Invalid text');
            tool = 'type_text'; params = {pageId,text:args.text};
          } else {
            if (!browserSessionTools.at(-1).inputSchema.properties.key.enum.includes(args.key)) throw Error('Invalid key');
            tool = 'press_key'; params = {pageId,key:args.key};
          }
        } else if (args.action === 'frame') {
          tool = 'take_screenshot'; params = {pageId,format:'jpeg',quality:45};
        } else { tool = 'list_pages'; params = {}; }
        return session.external(human ? 'human' : 'view', async () => {
          const result = await external(tool, params);
          // The keyboard backend echoes typed text. Never relay that response.
          return human ? {isError: result?.isError === true,
            content:[{type:'text',text:result?.isError ? 'Human action failed' : 'Human action completed'}]} : result;
        });
      }
      if (!actions.some(action => prefix + action === name)) return null;
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length)
        throw Error('Session commands accept no arguments');
      const action = name.slice(prefix.length);
      if (action !== 'status') session[action]();
      return { content: [{ type: 'text', text: JSON.stringify(session.snapshot()) }] };
    }
  };
}
