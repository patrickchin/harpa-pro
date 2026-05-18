/**
 * Flow: Upload / Media.
 *
 * Submenu for the files (presign/register/url) + voice leaves.
 *
 * NOTE: arch-tui-app.md §3.5 called for a richer multi-step
 * "pick path → presign → R2 PUT → register → auto-create note"
 * flow with the Pitfall-8 auto-note. The underlying `files upload`
 * citty leaf doesn't exist yet, so for now this submenu groups the
 * raw helpers that *do* exist. Tracked as a follow-up — see
 * arch-tui-app.md §6 step 9 "future".
 */
import type { Flow, FlowResult } from '../flow.js';
import { stay } from '../flow.js';
import { runSubmenu } from './_submenu.js';

export const uploadFlow: Flow = {
  id: 'upload',
  label: 'Upload / Media',
  hint: 'Presign URLs, register files, transcribe voice',
  visibleIn: ['authed'],
  async run({ prompter, session }): Promise<FlowResult> {
    await runSubmenu(prompter, session, 'Upload / Media', [
      { cittyPath: ['files', 'presign'], label: 'Presign upload URL' },
      { cittyPath: ['files', 'register'], label: 'Register uploaded file' },
      { cittyPath: ['files', 'url'], label: 'Get download URL' },
      { cittyPath: ['voice', 'transcribe'], label: 'Voice — transcribe' },
      { cittyPath: ['voice', 'summarize'], label: 'Voice — summarize' },
    ]);
    return stay;
  },
};
