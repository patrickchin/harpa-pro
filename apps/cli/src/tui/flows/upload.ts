/** Stub — TUI-app.8 replaces this with the upload + auto-note flow. */
import type { Flow, FlowResult } from '../flow.js';
import { stay } from '../flow.js';

export const uploadFlow: Flow = {
  id: 'upload',
  label: 'Upload a file',
  hint: 'Voice / image / document → timeline note (stub — see TUI-app.8)',
  visibleIn: ['authed'],
  async run({ prompter }): Promise<FlowResult> {
    prompter.log.info('Upload flow not yet implemented.');
    return stay;
  },
};
