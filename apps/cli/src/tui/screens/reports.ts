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
  let projectName = '';
  return {
    id: 'reports',
    breadcrumb: 'reports',
    async header(ctx) {
      const project =
        ctx.session.state.kind === 'authed' ? ctx.session.state.currentProject : undefined;
      if (!project) return undefined;
      projectName = project.name ?? project.id;
      const leaf = findLeaf(['reports', 'list']);
      if (!leaf) return { title: `Reports — ${projectName}`, lines: ['(unavailable)'] };
      const data = await fetchAllVia<ReportLike>(
        leaf,
        { projectId: project.id },
        ctx.session,
      );
      reports = data?.items ?? [];
      const drafts = reports.filter((r) => r.status !== 'finalized').length;
      const finals = reports.length - drafts;
      return {
        title: `Reports — ${projectName}`,
        lines: [
          reports.length === 0
            ? 'No reports yet — pick "New report" to create one'
            : `${reports.length} report${reports.length === 1 ? '' : 's'} · ${drafts} draft${drafts === 1 ? '' : 's'} · ${finals} final`,
        ],
      };
    },
    body() {
      if (reports.length === 0) {
        return {
          kind: 'empty',
          hint: 'No reports in this project yet.\nPick "New report" on the right to create one.',
        };
      }
      // Newest first so the most-recent report shows at the top.
      const sorted = [...reports].sort((a, b) =>
        String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
      );
      return {
        kind: 'list',
        columnTitles: ['#', 'status', 'visit', 'created'],
        items: sorted.map((r) => ({
          label: `#${String(r.number).padEnd(3)}`,
          columns: [
            (r.status ?? '').padEnd(9),
            (r.visitDate ?? '—').padEnd(11),
            String(r.createdAt ?? '').slice(0, 19),
          ],
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
