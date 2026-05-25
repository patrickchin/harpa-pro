/**
 * Report-rendering UI helpers. Ported from
 * `../haru3-reports/apps/mobile/lib/mobile-ui.ts` on branch `dev`.
 *
 * - `getIssueSeverityTone` maps an LLM-produced severity string to a
 *   visual tone for the IssuesCard severity stripe.
 * - `getReportStats` produces the StatBar tiles (workers / materials /
 *   issues) shown at the top of the report view.
 */
import type { GeneratedSiteReport } from '@harpa/report-core';

export type IssueSeverityTone = 'danger' | 'warning' | 'neutral';

export function getIssueSeverityTone(
  severity: string | null | undefined,
): IssueSeverityTone {
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
  value: number;
  label: string;
  tone: 'default' | 'warning';
}

export function getReportStats(report: GeneratedSiteReport): ReportStat[] {
  const workers = report.report.workers?.totalWorkers ?? 0;
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
