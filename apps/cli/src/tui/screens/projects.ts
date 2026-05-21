/**
 * Projects screen — top-level entry into the project drill-down.
 *
 * The viewport (left pane) renders the full project list as the
 * default preview. The interaction menu (right pane) carries only
 * the verbs: `Open project` · `New project` · `Refresh`.
 *
 * Picking `Open project` hands focus to the viewport via a
 * `viewportSelect` prompt. The user moves the highlight over the
 * same rows they were already looking at and presses `↵` to open;
 * `esc`/`h` snaps focus back to the actions menu. See
 * arch-tui-layout.md "two-pane focus model".
 *
 * On back-out the screen clears `currentProject` via `onExit` so the
 * cascade-clear invariant fires.
 */
import type { Screen, ScreenAction, ScreenContext } from '../screen.js';
import { runScreen } from '../screen.js';
import { fetchAllVia } from './_fetch.js';
import { findLeaf } from '../registry-find.js';
import { projectHomeScreen } from './project-home.js';
import type { ProjectLike } from '../../lib/render.js';
import type { ProjectRef } from '../session.js';

const ROLE: Record<string, string> = {
  owner: 'OWNER',
  editor: 'EDITOR',
  viewer: 'VIEWER',
};

function projectRow(p: ProjectLike): { label: string; columns: string[] } {
  const name = p.name ?? p.id;
  const role = ROLE[p.myRole] ?? p.myRole.toUpperCase();
  const client = p.clientName ?? '(no client)';
  const address = p.address ?? '(no address)';
  const created = `created ${String(p.createdAt ?? '').slice(0, 10) || '?'}`;
  const last = p.stats?.lastReportAt
    ? `last report ${String(p.stats.lastReportAt).slice(0, 10)}`
    : 'no reports yet';
  return {
    label: name,
    columns: [`[${role}]`, client, address, created, last],
  };
}

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
          lines: ['(unable to load — try Refresh or ← back)'],
        };
      }
      items = page.items;
      const total = items.length;
      const totalReports = items.reduce((sum, p) => sum + (p.stats?.totalReports ?? 0), 0);
      const totalDrafts = items.reduce((sum, p) => sum + (p.stats?.drafts ?? 0), 0);
      return {
        title: 'Projects',
        lines: [
          total === 0
            ? 'No projects yet'
            : `${total} project${total === 1 ? '' : 's'} · ${totalReports} report${totalReports === 1 ? '' : 's'} (${totalDrafts} draft)`,
        ],
      };
    },
    body() {
      if (items.length === 0) {
        return {
          kind: 'empty',
          hint: 'No projects yet.\nPick "New project" on the right to create one.',
        };
      }
      // Newest activity first.
      const sorted = [...items].sort((a, b) =>
        String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')),
      );
      const sections = sorted.map((p) => {
        const name = p.name ?? p.id;
        const role = ROLE[p.myRole] ?? p.myRole.toUpperCase();
        const lines: string[] = [];
        if (p.address) lines.push(`  address   ${p.address}`);
        if (p.clientName) lines.push(`  client    ${p.clientName}`);
        lines.push(`  created   ${String(p.createdAt ?? '').slice(0, 10) || '?'}`);
        if (p.stats) {
          const last = p.stats.lastReportAt
            ? `last ${String(p.stats.lastReportAt).slice(0, 10)}`
            : 'none yet';
          lines.push(
            `  reports   ${p.stats.totalReports} (${p.stats.drafts} draft${p.stats.drafts === 1 ? '' : 's'}, ${last})`,
          );
        }
        return { title: `${name}   [${role}]`, lines };
      });
      return { kind: 'detail' as const, sections };
    },
    actions(): ReadonlyArray<ScreenAction> {
      return [
        {
          kind: 'flow',
          label: 'Open project',
          run: async (ctx: ScreenContext) => {
            if (items.length === 0) {
              ctx.prompter.log.warn('No projects to open');
              return;
            }
            const sorted = [...items].sort((a, b) =>
              String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')),
            );
            const choice = await ctx.prompter.selectFromViewport<string>({
              label: 'Pick a project',
              items: sorted.map((p) => {
                const row = projectRow(p);
                return { value: p.id, label: row.label, columns: row.columns };
              }),
            });
            if (ctx.prompter.isCancel(choice)) return;
            const picked = sorted.find((p) => p.id === choice);
            if (!picked) return;
            const ref: ProjectRef = { id: picked.id, slug: picked.id, name: picked.name };
            ctx.session.setCurrentProject(ref);
            await runScreen(ctx.prompter, ctx.session, projectHomeScreen(), ctx.viewport);
          },
          refreshHeader: true,
        },
        {
          kind: 'leaf',
          label: 'New project',
          cittyPath: ['projects', 'create'],
          refreshHeader: true,
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
  viewport?: import('../viewport-sink.js').ViewportSink,
): Promise<void> {
  await runScreen(prompter, session, projectsScreen(), viewport);
}
