/**
 * Reports list screen — shows reports in the current project, lets
 * the user pick one (drill into report-home) or create a new one.
 *
 * When ≤ INLINE_OPEN rows, each shows as its own action; otherwise
 * collapses to a single "Open report…" picker.
 */
import chalk from 'chalk';
import type { Screen, ScreenAction, ScreenContext } from '../screen.js';
import { runScreen } from '../screen.js';
import { fetchAllVia } from './_fetch.js';
import { findLeaf } from '../registry-find.js';
import { reportHomeScreen } from './report-home.js';
import type { ReportLike } from '../../lib/render.js';

const INLINE_OPEN = 7;

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
            ? chalk.dim('No reports yet')
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

      const acts: ScreenAction[] = [];
      if (reports.length === 0) {
        // nothing inline
      } else if (reports.length <= INLINE_OPEN) {
        for (const r of reports) {
          acts.push({
            kind: 'screen',
            label: `#${r.number} (${r.status})`,
            hint: r.visitDate ?? r.createdAt,
            open: openReport(r),
            refreshHeader: true,
          });
        }
      } else {
        acts.push({
          kind: 'flow',
          label: `Open report… (${reports.length})`,
          refreshHeader: true,
          run: async (innerCtx) => {
            const choice = await innerCtx.prompter.select<string>({
              label: 'Pick a report to open',
              options: [
                ...reports.map((r) => ({
                  value: String(r.number),
                  label: `#${r.number} (${r.status})`,
                  hint: r.visitDate ?? r.createdAt,
                })),
                { value: '__cancel__', label: '← cancel' },
              ],
            });
            if (innerCtx.prompter.isCancel(choice) || choice === '__cancel__') return;
            const picked = reports.find((r) => String(r.number) === choice);
            if (!picked) return;
            await runScreen(innerCtx.prompter, innerCtx.session, openReport(picked)(innerCtx));
          },
        });
      }

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
