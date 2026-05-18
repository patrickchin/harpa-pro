/**
 * Project home screen — info header for the current project + menu
 * of report/member actions. Reached from `projectsScreen` after the
 * user picks a project; `session.currentProject` is already set.
 *
 * Actions:
 *   · New report                 ─► leaf reports.create (prefill projectId)
 *   · Reports                    ─► reportsScreen (TUI-nav.5)
 *   · Members                    ─► membersScreen (TUI-nav.4)
 *   · Edit project               ─► leaf projects.update (prefill id)
 *   · Delete project             ─► leaf projects.delete (confirm)
 *   · Refresh
 *   · ← back
 *
 * The Reports / Members screens land in later commits; until they
 * exist this screen exposes the underlying leaves with prefill, so
 * the drill-down works end-to-end even mid-rollout.
 */
import chalk from 'chalk';
import type { Screen, ScreenAction } from '../screen.js';
import { fetchVia } from './_fetch.js';
import { findLeaf } from '../registry-find.js';
import type { ProjectLike } from '../../lib/render.js';

export function projectHomeScreen(): Screen {
  return {
    id: 'project-home',
    async header(ctx) {
      const project = ctx.session.state.kind === 'authed' ? ctx.session.state.currentProject : undefined;
      if (!project) return undefined;
      const leaf = findLeaf(['projects', 'get']);
      if (!leaf) {
        return {
          title: `Project: ${project.name ?? project.id}`,
          lines: [chalk.dim('(unavailable)')],
        };
      }
      const data = await fetchVia<ProjectLike>(leaf, { id: project.id }, ctx.session);
      if (!data) return undefined; // 404 → resource gone, pop back

      const reports = data.stats?.totalReports ?? 0;
      const drafts = data.stats?.drafts ?? 0;
      return {
        title: `Project: ${data.name} (${data.id})`,
        lines: [
          `${chalk.dim('role')}: ${data.myRole}`,
          `${chalk.dim('client')}: ${data.clientName ?? '(none)'}`,
          `${chalk.dim('address')}: ${data.address ?? '(none)'}`,
          `${chalk.dim('reports')}: ${reports} (${drafts} draft${drafts === 1 ? '' : 's'})`,
        ],
      };
    },
    actions(ctx): ReadonlyArray<ScreenAction> {
      const project =
        ctx.session.state.kind === 'authed' ? ctx.session.state.currentProject : undefined;
      const slug = project?.id ?? '';
      return [
        {
          kind: 'leaf',
          label: 'New report',
          cittyPath: ['reports', 'create'],
          prefill: () => ({ projectId: slug }),
          refreshHeader: true,
        },
        {
          kind: 'leaf',
          label: 'List reports',
          cittyPath: ['reports', 'list'],
          prefill: () => ({ projectId: slug }),
        },
        {
          kind: 'leaf',
          label: 'List members',
          cittyPath: ['projects', 'members', 'list'],
          prefill: () => ({ projectId: slug }),
        },
        {
          kind: 'leaf',
          label: 'Add member',
          cittyPath: ['projects', 'members', 'add'],
          prefill: () => ({ projectId: slug }),
          refreshHeader: true,
        },
        {
          kind: 'leaf',
          label: 'Edit project',
          cittyPath: ['projects', 'update'],
          prefill: () => ({ id: slug }),
          refreshHeader: true,
        },
        {
          kind: 'leaf',
          label: 'Delete project',
          cittyPath: ['projects', 'delete'],
          prefill: () => ({ id: slug }),
          confirm: { label: `Delete project ${slug}? This cannot be undone.` },
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
    backLabel: '← back to projects',
  };
}
