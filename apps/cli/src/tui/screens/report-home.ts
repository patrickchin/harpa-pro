/**
 * Report Home screen — info header + status-aware action menu for
 * the currently-open report. See arch-tui-nav.md §3.1.
 *
 * Status-aware filtering:
 *   - Generate / Regenerate / Finalize only when status === 'draft'
 *   - Regenerate only after first generate has produced body
 *   - PDF only when status === 'final'
 *
 * Note: the report record has `status: 'draft' | 'finalized'` from
 * the API; this screen normalises to the `'draft' | 'final'`
 * UI vocabulary internally.
 */
import chalk from 'chalk';
import type { Screen, ScreenAction } from '../screen.js';
import { fetchVia } from './_fetch.js';
import { findLeaf } from '../registry-find.js';
import { notesScreen } from './notes.js';
import { uploadScreen } from './upload.js';
import type { ReportLike } from '../../lib/render.js';

export function reportHomeScreen(): Screen {
  let report: ReportLike | undefined;
  return {
    id: 'report-home',
    async header(ctx) {
      if (ctx.session.state.kind !== 'authed') return undefined;
      const { currentProject, currentReport } = ctx.session.state;
      if (!currentProject || !currentReport) return undefined;
      const leaf = findLeaf(['reports', 'get']);
      if (!leaf) return { title: 'Report', lines: ['(unavailable)'] };
      report = await fetchVia<ReportLike>(
        leaf,
        { project: currentProject.id, number: currentReport.number },
        ctx.session,
      );
      if (!report) return undefined; // 404 — pop
      const hasBody = !!report.body;
      const finalized = report.status === 'finalized';
      return {
        title: `Report #${report.number} — ${currentProject.name ?? currentProject.id}`,
        lines: [
          `${chalk.dim('status')}: ${report.status}`,
          `${chalk.dim('visit')}: ${report.visitDate ?? '(none)'}`,
          `${chalk.dim('created')}: ${report.createdAt}`,
          `${chalk.dim('generated')}: ${hasBody ? 'yes' : 'no'}  ·  ${chalk.dim('finalized')}: ${finalized ? 'yes' : 'no'}`,
        ],
      };
    },
    actions(ctx): ReadonlyArray<ScreenAction> {
      if (ctx.session.state.kind !== 'authed') return [];
      const { currentProject, currentReport } = ctx.session.state;
      if (!currentProject || !currentReport) return [];
      const project = currentProject.id;
      const number = currentReport.number;
      const isDraft = report?.status !== 'finalized';
      const hasBody = !!report?.body;

      const acts: ScreenAction[] = [
        {
          kind: 'leaf',
          label: 'Add text note',
          cittyPath: ['notes', 'create'],
          prefill: () => ({ project, reportNumber: number, kind: 'text' }),
          refreshHeader: true,
        },
        {
          kind: 'screen',
          label: 'Upload media',
          open: () => uploadScreen(),
          refreshHeader: true,
        },
        {
          kind: 'screen',
          label: 'View notes',
          open: () => notesScreen(),
          refreshHeader: true,
        },
      ];

      if (isDraft) {
        acts.push({
          kind: 'leaf',
          label: hasBody ? 'Regenerate' : 'Generate report',
          cittyPath: hasBody ? ['reports', 'regenerate'] : ['reports', 'generate'],
          prefill: () => ({ project, number }),
          refreshHeader: true,
        });
        acts.push({
          kind: 'leaf',
          label: 'Finalize',
          cittyPath: ['reports', 'finalize'],
          prefill: () => ({ project, number }),
          confirm: { label: `Finalize report #${number}?` },
          refreshHeader: true,
        });
      }

      if (!isDraft) {
        acts.push({
          kind: 'leaf',
          label: 'Download PDF',
          cittyPath: ['reports', 'pdf'],
          prefill: () => ({ project, number }),
        });
      }

      acts.push({
        kind: 'leaf',
        label: 'Edit metadata',
        cittyPath: ['reports', 'update'],
        prefill: () => ({ project, number }),
        refreshHeader: true,
      });
      acts.push({
        kind: 'leaf',
        label: 'Delete report',
        cittyPath: ['reports', 'delete'],
        prefill: () => ({ project, number }),
        confirm: { label: `Delete report #${number}? This cannot be undone.` },
        refreshHeader: true,
      });
      acts.push({ kind: 'flow', label: 'Refresh', run: async () => {}, refreshHeader: true });
      return acts;
    },
    backLabel: '← back to reports',
  };
}
