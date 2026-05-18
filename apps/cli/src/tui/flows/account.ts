/**
 * Flow: Account.
 *
 * One-stop submenu for the leaves that touch the signed-in user's
 * own data: profile, usage, AI settings. They're the same leaves
 * available under Developer › Raw API; this flow just groups them
 * under a friendlier label and skips the citty-shaped group menu.
 *
 * See arch-tui-app.md §3.5.
 */
import type { Flow, FlowResult } from '../flow.js';
import { stay } from '../flow.js';
import { runSubmenu } from './_submenu.js';

export const accountFlow: Flow = {
  id: 'account',
  label: 'Account',
  hint: 'Profile, usage, AI settings',
  visibleIn: ['authed'],
  async run({ prompter, session }): Promise<FlowResult> {
    await runSubmenu(prompter, session, 'Account', [
      { cittyPath: ['me', 'get'], label: 'Show profile' },
      { cittyPath: ['me', 'update'], label: 'Update profile' },
      { cittyPath: ['me', 'usage'], label: 'Show usage' },
      { cittyPath: ['settings', 'ai', 'get'], label: 'AI settings — show' },
      { cittyPath: ['settings', 'ai', 'set'], label: 'AI settings — update' },
    ]);
    return stay;
  },
};
