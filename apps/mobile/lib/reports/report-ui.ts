/**
 * Report-rendering UI helpers. Ported from
 * `../haru3-reports/apps/mobile/lib/mobile-ui.ts` on branch `dev`.
 *
 * - `getIssueSeverityTone` maps an LLM-produced severity string to a
 *   visual tone for the IssuesCard severity stripe.
 * - `getReportStats` produces the StatBar tiles (workers / materials /
 *   issues) shown at the top of the report view.
 */
import { reports } from '@harpa/api-contract';

import { getWorkerDisplaySummaryFromWorkers } from './report-body';

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

export function toTitleCase(value: string): string {
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function getItemMeta(values: Array<string | null | undefined>): string {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(' • ');
}

export function getIssueMeta(
  issue: reports.ReportBody['issues'][number],
): string {
  return getItemMeta([
    issue.severity ? `${toTitleCase(issue.severity)} severity` : null,
  ]);
}

function workerStatValue(workers: reports.ReportBody['workers']): string | number {
  const summary = getWorkerDisplaySummaryFromWorkers(workers);
  return summary.totalWorkers ?? summary.totalWorkersLabel ?? 0;
}

export function getReportStats(report: reports.ReportBody): ReportStat[] {
  const workers = workerStatValue(report.workers);
  const materials = report.materials.length;
  const issues = report.issues.length;

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
