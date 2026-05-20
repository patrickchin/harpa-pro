/**
 * Reports list screen — shows reports in the current project in the
 * viewport, and inlines each report as an "Open #N" action in the
 * interaction pane so the user can act on what they already see.
 */
import type { Screen, ScreenAction, ScreenContext } from '../screen.js';
import { fetchAllVia } from './_fetch.js';
import { findLeaf } from '../registry-find.js';
import { reportHomeScreen } from './report-home.js';
import type { ReportLike } from '../../lib/render.js';

export function reportsScreen(): Screen {
  let reports: ReportLike[] = [];
  return {
    id: 'reports',
    breadcrumb: 'reports',
    async header(ctx) {
      const project =
        ctx.session.state.kind === 'authed' ? ctx.session.state.currentProject : undefined;
      if (!project) return undefined;
      const leaf = findLeaf(['reports', 'list']);
      if (!leaf) return { title: 'Reports', lines: ['(unavailable)'] };
      const data = await fetchAllVia<ReportLike>(
        leaf,
        { projectId: project.id },
        ctx.session,
      );
      reports = data?.items ?? [];
      return {
        title: `Reports in ${project.name ?? project.id}`,
        lines: [
          reports.length === 0
            ? 'No reports yet'
            : `${reports.length} report${reports.length === 1 ? '' : 's'}`,
        ],
      };
    },
    body() {
      if (reports.length === 0) {
        return { kind: 'empty', hint: 'No reports yet' };
      }
      return {
        kind: 'list',
        items: reports.map((r) => ({
          label: `#${r.number}`,
          hint: `${r.status}${r.visitDate ? ` · ${r.visitDate}` : ''}`,
        })),
      };
    },
    actions(ctx): ReadonlyArray<ScreenAction> {
      const project =
        ctx.session.state.kind === 'authed' ? ctx.session.state.currentProject : undefined;
      const slug = project?.id ?? '';
      const openReport = (r: ReportLike) => (childCtx: ScreenContext) => {
        childCtx.session.setCurrentReport({
          projectSlug: slug,
          number: r.number,
          status: r.status === 'finalized' ? 'final' : 'draft',
        });
        return reportHomeScreen();
      };

      const acts: ScreenAction[] = reports.map((r) => ({
        kind: 'screen',
        label: `Open #${r.number} (${r.status})`,
        hint: r.visitDate ?? r.createdAt,
        open: openReport(r),
        refreshHeader: true,
      }));

      return [
        ...acts,
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
