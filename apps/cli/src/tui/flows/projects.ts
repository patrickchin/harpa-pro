/** Stub — TUI-app.6 / TUI-app.7 replace this with the real flow. */
import type { Flow, FlowResult } from '../flow.js';
import { stay } from '../flow.js';

export const projectsFlow: Flow = {
  id: 'projects',
  label: 'Projects',
  hint: 'List, open, create (stub — see TUI-app.6)',
  visibleIn: ['authed'],
  async run({ prompter }): Promise<FlowResult> {
    prompter.log.info('Projects flow not yet implemented.');
    return stay;
  },
};
