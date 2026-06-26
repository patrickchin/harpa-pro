/**
 * Report-rendering UI helpers. Ported from
 * `../haru3-reports/apps/mobile/lib/mobile-ui.ts` on branch `dev`.
 *
 * - `getIssueSeverityTone` maps an LLM-produced severity string to a
 *   visual tone for the IssuesCard severity stripe.
 * - `getReportStats` produces the StatBar tiles (workers / materials /
 *   issues) shown at the top of the report view.
 */
import type { GeneratedReportWorkers, GeneratedSiteReport } from '@harpa/report-core';

export type IssueSeverityTone = 'danger' | 'warning' | 'neutral';

export function getIssueSeverityTone(severity: string | null | undefined): IssueSeverityTone {
  switch ((severity ?? '').trim().toLowerCase()) {
    case 'high':
    case 'critical':
      return 'danger';
    case 'medium':
      return 'warning';
    default:
      return 'neutral';
  }
}

export interface ReportStat {
  value: string | number;
  label: string;
  tone: 'default' | 'warning';
}

function workerStatValue(workers: GeneratedReportWorkers | null): string | number {
  if (!workers) return 0;
  if (workers.totalWorkers !== null) return workers.totalWorkers;
  return (
    workers.roles
      .map((role) => role.count?.trim())
      .find((count): count is string => Boolean(count)) ?? 0
  );
}

export function getReportStats(report: GeneratedSiteReport): ReportStat[] {
  const workers = workerStatValue(report.report.workers);
  const materials = report.report.materials.length;
  const issues = report.report.issues.length;

  return [
    {
      value: workers,
      label: workers === 1 ? 'Worker' : 'Workers',
      tone: 'default',
    },
    {
      value: materials,
      label: materials === 1 ? 'Material' : 'Materials',
      tone: 'default',
    },
    {
      value: issues,
      label: issues === 1 ? 'Issue' : 'Issues',
      tone: issues > 0 ? 'warning' : 'default',
    },
  ];
}
