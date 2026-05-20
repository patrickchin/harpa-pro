/**
 * Flow: Account.
 *
 * Thin shim that opens the navigational Account screen (v4.2 layout).
 * The previous flat submenu (Show profile / Show usage / …) has been
 * replaced by `screens/account.ts` which renders the full profile as
 * a `detail` body in the viewport while keeping the verbs (Edit
 * profile / Update AI settings) in the interaction pane.
 *
 * See docs/v4/arch-tui-layout-v2.md §6.1.
 */
import type { Flow, FlowResult } from '../flow.js';
import { stay } from '../flow.js';
import { runScreen } from '../screen.js';
import { accountScreen } from '../screens/account.js';
import { nullViewportSink } from '../viewport-sink.js';

export const accountFlow: Flow = {
  id: 'account',
  label: 'Account',
  hint: 'Profile, usage, AI settings',
  visibleIn: ['authed'],
  async run({ prompter, session, viewport }): Promise<FlowResult> {
    await runScreen(prompter, session, accountScreen(), viewport ?? nullViewportSink());
    return stay;
  },
};
