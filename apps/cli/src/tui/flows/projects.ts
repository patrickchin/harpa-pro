/**
 * Flow: Projects.
 *
 * Submenu wrapping the projects + members + reports + notes leaves.
 * Keeps the v1 raw-API behaviour but under a single 'Projects' entry
 * with reports/members/notes grouped together (rather than spread
 * across the citty group names). The richer 'open project →
 * everything is scoped to that ID' UX is a follow-up — for now this
 * is grouping-only, matching the auth flow's stay-and-loop pattern.
 *
 * See arch-tui-app.md §3.5.
 */
import type { Flow, FlowResult } from '../flow.js';
import { stay } from '../flow.js';
import { runSubmenu } from './_submenu.js';

export const projectsFlow: Flow = {
  id: 'projects',
  label: 'Projects',
  hint: 'Projects, members, reports, notes',
  visibleIn: ['authed'],
  async run({ prompter, session }): Promise<FlowResult> {
    await runSubmenu(prompter, session, 'Projects', [
      { cittyPath: ['projects', 'list'], label: 'List projects' },
      { cittyPath: ['projects', 'create'], label: 'Create project' },
      { cittyPath: ['projects', 'get'], label: 'Show project' },
      { cittyPath: ['projects', 'update'], label: 'Update project' },
      { cittyPath: ['projects', 'delete'], label: 'Delete project' },
      { cittyPath: ['projects', 'members', 'list'], label: 'List members' },
      { cittyPath: ['projects', 'members', 'add'], label: 'Add member' },
      { cittyPath: ['projects', 'members', 'remove'], label: 'Remove member' },
      { cittyPath: ['reports', 'list'], label: 'Reports — list' },
      { cittyPath: ['reports', 'create'], label: 'Reports — create' },
      { cittyPath: ['reports', 'get'], label: 'Reports — show' },
      { cittyPath: ['reports', 'update'], label: 'Reports — update' },
      { cittyPath: ['reports', 'delete'], label: 'Reports — delete' },
      { cittyPath: ['reports', 'generate'], label: 'Reports — AI generate' },
      { cittyPath: ['reports', 'regenerate'], label: 'Reports — AI regenerate' },
      { cittyPath: ['reports', 'finalize'], label: 'Reports — finalize' },
      { cittyPath: ['reports', 'pdf'], label: 'Reports — PDF' },
      { cittyPath: ['notes', 'list'], label: 'Notes — list' },
      { cittyPath: ['notes', 'create'], label: 'Notes — create' },
      { cittyPath: ['notes', 'update'], label: 'Notes — update' },
      { cittyPath: ['notes', 'delete'], label: 'Notes — delete' },
    ]);
    return stay;
  },
};
