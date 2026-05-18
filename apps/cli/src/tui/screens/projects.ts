/**
 * Projects screen — top-level entry into the project drill-down.
 *
 * Header: total count + (when available) recent project names.
 * Actions: one "Open <name>" per project, plus "New project",
 * "List all projects" (raw render), "Refresh", "← back".
 *
 * Picking a project sets `session.currentProject` and opens the
 * project home screen. On back-out the screen clears the current
 * project via its `onExit` so the cascade-clear invariant fires.
 */
import chalk from 'chalk';
import type { Screen, ScreenAction } from '../screen.js';
import { runScreen } from '../screen.js';
import { fetchVia } from './_fetch.js';
import { findLeaf } from '../registry-find.js';
import { projectHomeScreen } from './project-home.js';
import type { ProjectLike } from '../../lib/render.js';
import type { ProjectRef } from '../session.js';

interface ProjectsPage {
  items: ProjectLike[];
  nextCursor: string | null;
}

const MAX_OPEN = 7;

export function projectsScreen(): Screen {
  let page: ProjectsPage | undefined;
  return {
    id: 'projects',
    async header(ctx) {
      const leaf = findLeaf(['projects', 'list']);
      if (!leaf) return { title: 'Projects', lines: ['(unavailable)'] };
      page = await fetchVia<ProjectsPage>(leaf, { limit: 20 }, ctx.session);
      if (!page) {
        return {
          title: 'Projects',
          lines: [chalk.dim('(unable to load — try Refresh or ← back)')],
        };
      }
      const total = page.items.length;
      const recent = page.items
        .slice(0, 3)
        .map((p) => p.name)
        .join(', ');
      return {
        title: 'Projects',
        lines: [
          total === 0
            ? chalk.dim('No projects yet')
            : `${total} project${total === 1 ? '' : 's'}${recent ? ` · ${chalk.dim(recent)}` : ''}`,
        ],
      };
    },
    actions(): ReadonlyArray<ScreenAction> {
      const items = page?.items ?? [];
      const open: ScreenAction[] = items.slice(0, MAX_OPEN).map((p) => ({
        kind: 'screen',
        label: `Open ${p.name}`,
        hint: p.clientName ?? undefined,
        open: (ctx) => {
          const ref: ProjectRef = { id: p.id, slug: p.id, name: p.name };
          ctx.session.setCurrentProject(ref);
          return projectHomeScreen();
        },
        refreshHeader: true,
      }));
      return [
        ...open,
        {
          kind: 'leaf',
          label: 'New project',
          cittyPath: ['projects', 'create'],
          refreshHeader: true,
        },
        {
          kind: 'leaf',
          label: 'List all projects (raw)',
          cittyPath: ['projects', 'list'],
        },
        {
          kind: 'flow',
          label: 'Refresh',
          run: async () => {},
          refreshHeader: true,
        },
      ];
    },
    onExit(ctx) {
      // Clearing the project also clears any currentReport (invariant).
      ctx.session.setCurrentProject(undefined);
    },
  };
}

/** Top-level entry used by `flows/projects.ts`. */
export async function runProjectsScreen(
  prompter: import('../prompter.js').Prompter,
  session: import('../session.js').Session,
): Promise<void> {
  await runScreen(prompter, session, projectsScreen());
}
