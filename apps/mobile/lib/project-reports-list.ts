/**
 * Helpers for the project reports list. Pure data — no RN deps.
 *
 * Ported & simplified from
 * `../haru3-reports/apps/mobile/lib/project-reports-list.ts` on branch
 * `dev`. v4 contract differences:
 *   - reports carry a per-project `number` and `visitDate`
 *   - status enum is { draft | finalized } (not { draft | final })
 *   - no `created_at` snake-case — use `createdAt`
 */
import { formatDate } from './date';

export type ReportListItem = {
  id: string;
  slug: string;
  number: number;
  status: 'draft' | 'finalized';
  visitDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export function getReportTitle(r: ReportListItem): string {
  const dateIso = r.visitDate ?? r.createdAt;
  const datePart = formatDate(dateIso);
  return `Report #${r.number} · ${datePart}`;
}

export function getReportMeta(r: ReportListItem): string {
  if (r.status === 'draft') return 'Draft · in progress';
  return `Finalized · ${formatDate(r.updatedAt)}`;
}

export type ReportSection = {
  title: string;
  data: ReportListItem[];
};

/** Section list groups: drafts first, then finalized — both sorted by recency. */
export function buildReportsSections(
  reports: ReadonlyArray<ReportListItem>,
): ReportSection[] {
  const drafts: ReportListItem[] = [];
  const finalized: ReportListItem[] = [];
  for (const r of reports) {
    (r.status === 'draft' ? drafts : finalized).push(r);
  }
  const byRecent = (a: ReportListItem, b: ReportListItem) =>
    Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  drafts.sort(byRecent);
  finalized.sort(byRecent);
  const sections: ReportSection[] = [];
  if (drafts.length) sections.push({ title: 'Drafts', data: drafts });
  if (finalized.length) sections.push({ title: 'Finalized', data: finalized });
  return sections;
}
