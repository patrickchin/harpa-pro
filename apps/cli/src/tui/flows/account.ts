/** Stub — TUI-app.5 replaces this with the real account submenu. */
import type { Flow, FlowResult } from '../flow.js';
import { stay } from '../flow.js';

export const accountFlow: Flow = {
  id: 'account',
  label: 'Account',
  hint: 'Profile + usage + AI settings (stub — see TUI-app.5)',
  visibleIn: ['authed'],
  async run({ prompter }): Promise<FlowResult> {
    prompter.log.info('Account flow not yet implemented.');
    return stay;
  },
};
