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
}));

export function createBrowserAgentSession(execute) {
  const session = new BrowserSession({
    objective: 'Session Chrome VORTEX',
    execute: (_name, payload, signal) => execute(payload, signal),
    capture: async () => { throw Error('Use authorized Chrome screenshot tool'); }
  });
  return {
    run: (route, args, timeout) => session.run(route.real, { route, args, timeout }),
    control: (name, args = {}) => {
      if (!actions.some(action => prefix + action === name)) return null;
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length)
        throw Error('Session commands accept no arguments');
      const action = name.slice(prefix.length);
      if (action !== 'status') session[action]();
      return { content: [{ type: 'text', text: JSON.stringify(session.snapshot()) }] };
    }
  };
}
