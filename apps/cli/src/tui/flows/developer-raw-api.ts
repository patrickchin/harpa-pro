/**
 * Flow: Developer › Raw API.
 *
 * The v1 flat menu, preserved verbatim for power users / debugging.
 * Lives under "Developer" so casual users aren't confronted with
 * `POST /reports/{id}/notes` as a menu item. Available only when
 * authenticated (most leaves require a token) — `set-api-url`
 * is its own top-level flow above.
 *
 * See arch-tui-app.md §3.5 — every existing TUI leaf stays reachable
 * here, with the surface marker on TuiSpec used to suppress
 * leaves that flows fully subsume.
 */
import type { Flow, FlowResult } from '../flow.js';
import { stay } from '../flow.js';
import { runRawApiMenu } from '../menu.js';

export const developerRawApiFlow: Flow = {
  id: 'developer-raw-api',
  label: 'Developer › Raw API',
  hint: 'Browse every endpoint as a flat menu (debug / power use)',
  visibleIn: ['authed'],
  async run({ prompter, session }): Promise<FlowResult> {
    await runRawApiMenu(prompter, session);
    return stay;
  },
};
