/**
 * Reports list screen — shows reports in the current project, lets
 * the user pick one (drill into report-home) or create a new one.
 */
import chalk from 'chalk';
import type { Screen, ScreenAction } from '../screen.js';
import { fetchVia } from './_fetch.js';
import { findLeaf } from '../registry-find.js';
import { reportHomeScreen } from './report-home.js';
import type { ReportLike } from '../../lib/render.js';

interface ReportsPage {
  items: ReportLike[];
  nextCursor: string | null;
}

export function reportsScreen(): Screen {
  let reports: ReportLike[] = [];
  return {
    id: 'reports',
    async header(ctx) {
      const project =
        ctx.session.state.kind === 'authed' ? ctx.session.state.currentProject : undefined;
      if (!project) return undefined;
      const leaf = findLeaf(['reports', 'list']);
      if (!leaf) return { title: 'Reports', lines: ['(unavailable)'] };
      const data = await fetchVia<ReportsPage>(
        leaf,
        { projectId: project.id, limit: 20 },
        ctx.session,
      );
      reports = data?.items ?? [];
      return {
        title: `Reports in ${project.name ?? project.id}`,
        lines: [
          reports.length === 0
            ? chalk.dim('No reports yet')
            : `${reports.length} report${reports.length === 1 ? '' : 's'}`,
        ],
      };
    },
    actions(ctx): ReadonlyArray<ScreenAction> {
      const project =
        ctx.session.state.kind === 'authed' ? ctx.session.state.currentProject : undefined;
      const slug = project?.id ?? '';
      const open: ScreenAction[] = reports.map((r) => ({
        kind: 'screen',
        label: `#${r.number} (${r.status})`,
        hint: r.visitDate ?? r.createdAt,
        open: (childCtx) => {
          childCtx.session.setCurrentReport({
            projectSlug: slug,
            number: r.number,
            status: r.status === 'finalized' ? 'final' : 'draft',
          });
          return reportHomeScreen();
        },
        refreshHeader: true,
      }));
      return [
        ...open,
        {
          kind: 'leaf',
          label: 'New report',
          cittyPath: ['reports', 'create'],
          prefill: () => ({ projectId: slug }),
          refreshHeader: true,
        },
        { kind: 'flow', label: 'Refresh', run: async () => {}, refreshHeader: true },
      ];
    },
    onExit(ctx) {
      ctx.session.setCurrentReport(undefined);
    },
  };
}
