/**
 * Projects screen — top-level entry into the project drill-down.
 *
 * Header: total count + (when available) recent project names.
 * Actions: when ≤ INLINE_OPEN projects, one "Open <name>" per
 * project; otherwise a single "Open project…" picker. Plus
 * "New project", "List all projects (raw)", "Refresh", "← back".
 *
 * Picking a project sets `session.currentProject` and opens the
 * project home screen. On back-out the screen clears the current
 * project via its `onExit` so the cascade-clear invariant fires.
 */
import chalk from 'chalk';
import type { Screen, ScreenAction } from '../screen.js';
import { runScreen } from '../screen.js';
import { fetchAllVia } from './_fetch.js';
import { findLeaf } from '../registry-find.js';
import { projectHomeScreen } from './project-home.js';
import type { ProjectLike } from '../../lib/render.js';
import type { ProjectRef } from '../session.js';

const INLINE_OPEN = 7;

export function projectsScreen(): Screen {
  let items: ProjectLike[] = [];
  return {
    id: 'projects',
    breadcrumb: 'projects',
    async header(ctx) {
      const leaf = findLeaf(['projects', 'list']);
      if (!leaf) return { title: 'Projects', lines: ['(unavailable)'] };
      const page = await fetchAllVia<ProjectLike>(leaf, {}, ctx.session);
      if (!page) {
        items = [];
        return {
          title: 'Projects',
          lines: [chalk.dim('(unable to load — try Refresh or ← back)')],
        };
      }
      items = page.items;
      const total = items.length;
      const recent = items.slice(0, 3).map((p) => p.name).join(', ');
      return {
        title: 'Projects',
        lines: [
          total === 0
            ? chalk.dim('No projects yet')
            : `${total} project${total === 1 ? '' : 's'}${recent ? ` · ${chalk.dim(recent)}` : ''}`,
        ],
      };
    },
    body() {
      if (items.length === 0) {
        return { kind: 'empty', hint: 'No projects yet' };
      }
      return {
        kind: 'list',
        items: items.map((p) => ({
          label: p.name ?? p.id,
          hint: p.myRole,
          mirrorsAction: items.length <= INLINE_OPEN ? `Open ${p.name}` : undefined,
        })),
      };
    },
    actions(): ReadonlyArray<ScreenAction> {
      const openProject = (p: ProjectLike) => (ctx: import('../screen.js').ScreenContext) => {
        const ref: ProjectRef = { id: p.id, slug: p.id, name: p.name };
        ctx.session.setCurrentProject(ref);
        return projectHomeScreen();
      };

      const acts: ScreenAction[] = [];
      if (items.length === 0) {
        // no inline rows; just the create + refresh below.
      } else if (items.length <= INLINE_OPEN) {
        for (const p of items) {
          acts.push({
            kind: 'screen',
            label: `Open ${p.name}`,
            hint: p.clientName ?? undefined,
            open: openProject(p),
            refreshHeader: true,
          });
        }
      } else {
        acts.push({
          kind: 'flow',
          label: `Open project… (${items.length})`,
          refreshHeader: true,
          run: async (ctx) => {
            const choice = await ctx.prompter.select<string>({
              label: 'Pick a project to open',
              options: [
                ...items.map((p) => ({
                  value: p.id,
                  label: p.name,
                  hint: p.clientName ?? undefined,
                })),
                { value: '__cancel__', label: '← cancel' },
              ],
            });
            if (ctx.prompter.isCancel(choice) || choice === '__cancel__') return;
            const picked = items.find((p) => p.id === choice);
            if (!picked) return;
            await runScreen(ctx.prompter, ctx.session, openProject(picked)(ctx));
          },
        });
      }
      return [
        ...acts,
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
