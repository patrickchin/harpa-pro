/**
 * Flow: Upload / Media.
 *
 * Per arch-tui-nav.md §3.6, upload now belongs inside Report Home —
 * every upload targets a specific report. This top-level entry
 * exists for discoverability but just redirects: it shows a one-
 * option select that opens Projects (drill down to a report; the
 * Upload media action lives in Report Home).
 *
 * The richer Pitfall-8 "auto-create note from upload" flow remains
 * a deferred carve-out (arch-tui-app §6 step 9). When the unified
 * `files upload` leaf lands, the Report-Home upload screen invokes
 * it with prefill and the noteCount header refreshes — visible
 * regression there.
 */
import type { Flow, FlowResult } from '../flow.js';
import { stay } from '../flow.js';
import { runProjectsScreen } from '../screens/projects.js';

export const uploadFlow: Flow = {
  id: 'upload',
  label: 'Upload / Media',
  hint: 'Uploads belong to a report — opens Projects',
  visibleIn: ['authed'],
  async run({ prompter, session, viewport }): Promise<FlowResult> {
    const choice = await prompter.select<string>({
      label: 'Uploads belong to a report. Pick where to go:',
      options: [
        { value: 'projects', label: 'Open a project → report' },
        { value: 'back', label: '← back' },
      ],
    });
    if (prompter.isCancel(choice) || choice === 'back') return stay;
    await runProjectsScreen(prompter, session, viewport);
    return stay;
  },
};
