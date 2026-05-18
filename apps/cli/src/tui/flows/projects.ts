/**
 * Flow: Projects.
 *
 * Opens the navigation-style Projects screen (TUI-nav.3+). Project
 * picking, drill-down to project home, members/reports actions, and
 * prefill all live in `tui/screens/`. The raw flat submenu has been
 * replaced — every leaf is still reachable via Developer › Raw API.
 *
 * See arch-tui-nav.md §3.1 and arch-tui-app.md §3.5.
 */
import type { Flow, FlowResult } from '../flow.js';
import { stay } from '../flow.js';
import { runProjectsScreen } from '../screens/projects.js';

export const projectsFlow: Flow = {
  id: 'projects',
  label: 'Projects',
  hint: 'Projects, members, reports, notes',
  visibleIn: ['authed'],
  async run({ prompter, session }): Promise<FlowResult> {
    await runProjectsScreen(prompter, session);
    return stay;
  },
};
