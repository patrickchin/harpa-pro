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
import { formatDate } from '../util/date';

/** True iff `id` was minted by `optimisticReportId` in `lib/api/optimistic.ts`. */
export function isOptimisticReportId(id: string | undefined | null): boolean {
  return typeof id === 'string' && id.startsWith('rep_opt');
}

/**
 * Minimal structural shape of the body field returned by the
 * `/projects/{project}/reports` list endpoint. We only read
 * `meta.title` — everything else is irrelevant to the list row.
 */
type ListReportBody = {
  meta?: { title?: string | null } | null;
} | null;

export type ReportListItem = {
  id: string;
  number: number;
  status: 'draft' | 'finalized';
  visitDate: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Optional `body` from the list endpoint. We only need
   * `body.meta.title` for the title heading — everything else is
   * read via the detail query. Absent on optimistic-create rows.
   */
  body?: ListReportBody;
};

/**
 * Title rule (see `docs/v4/design-report-title-consistency.md`):
 *   title = meta.title?.trim() || `Report #N`
 *
 * Applied identically on the list row, the draft header, and the
 * finalized header so all three surfaces agree.
 */
export function getReportTitle(r: ReportListItem): string {
  const metaTitle = r.body?.meta?.title?.trim();
  return metaTitle && metaTitle.length > 0 ? metaTitle : `Report #${r.number}`;
}

/**
 * Small-text meta line shown under the row title:
 *   #N · {visit date or created date} · {Draft | Finalized {updatedAt}}
 */
export function getReportMeta(r: ReportListItem): string {
  const dateIso = r.visitDate ?? r.createdAt;
  const visit = formatDate(dateIso);
  const status =
    r.status === 'draft' ? 'Draft' : `Finalized ${formatDate(r.updatedAt)}`;
  return `#${r.number} · ${visit} · ${status}`;
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
