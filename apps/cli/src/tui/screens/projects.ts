/**
 * Projects screen — top-level entry into the project drill-down.
 *
 * Header: total count + (when available) recent project names.
 * The viewport renders the full project list. The interaction pane
 * inlines one "Open <project>" action per project so the user can
 * act on what they're already looking at — no separate picker, no
 * raw-list redundancy (see arch-tui-layout.md "context first").
 *
 * Picking a project sets `session.currentProject` and opens the
 * project home screen. On back-out the screen clears the current
 * project via its `onExit` so the cascade-clear invariant fires.
 */
// chalk removed: OpenTUI viewport text is a buffer, not a tty stream.
import type { Screen, ScreenAction, ScreenContext } from '../screen.js';
import { runScreen } from '../screen.js';
import { fetchAllVia } from './_fetch.js';
import { findLeaf } from '../registry-find.js';
import { projectHomeScreen } from './project-home.js';
import type { ProjectLike } from '../../lib/render.js';
import type { ProjectRef } from '../session.js';

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
      const ROLE: Record<string, string> = {
        owner: 'OWNER',
        editor: 'EDITOR',
        viewer: 'VIEWER',
      };
      // Newest activity first.
      const sorted = [...items].sort((a, b) =>
        String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')),
      );
      const sections = sorted.map((p) => {
        const name = p.name ?? p.id;
        const role = ROLE[p.myRole] ?? p.myRole.toUpperCase();
        const lines: string[] = [];
        if (p.clientName) lines.push(`  client    ${p.clientName}`);
        if (p.address) lines.push(`  address   ${p.address}`);
        if (p.stats) {
          const last = p.stats.lastReportAt
            ? `, last ${String(p.stats.lastReportAt).slice(0, 10)}`
            : '';
          lines.push(
            `  reports   ${p.stats.totalReports} (${p.stats.drafts} draft${p.stats.drafts === 1 ? '' : 's'}${last})`,
          );
        }
        lines.push(`  updated   ${String(p.updatedAt ?? '').slice(0, 10)}`);
        lines.push(`  slug      ${p.id}`);
        return { title: `${name}   [${role}]`, lines };
      });
      return { kind: 'detail', sections };
    },
    actions(): ReadonlyArray<ScreenAction> {
      const openProject = (p: ProjectLike) => (ctx: ScreenContext) => {
        const ref: ProjectRef = { id: p.id, slug: p.id, name: p.name };
        ctx.session.setCurrentProject(ref);
        return projectHomeScreen();
      };

      const acts: ScreenAction[] = items.map((p) => ({
        kind: 'screen',
        label: `Open ${p.name ?? p.id}`,
        hint: p.clientName ?? undefined,
        open: openProject(p),
        refreshHeader: true,
      }));
      return [
        ...acts,
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
