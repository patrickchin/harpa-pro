/**
 * Shared label helpers for the Generate Report tab bar. Kept in
 * `lib/` so the tab bar component and any future routing/header logic
 * stay in sync without a dependency cycle.
 *
 * Ported from `../haru3-reports/apps/mobile/lib/generate-report-ui.ts`
 * on branch `dev`. v4 dropped the `debug` tab from the visible tab bar
 * (the canonical source kept it behind a flag) so the helper accepts
 * only the three user-facing tabs.
 */
export function getGenerateReportTabLabel(
  tab: 'notes' | 'report' | 'edit',
  notesCount: number,
): string {
  if (tab === 'notes') return `Notes (${notesCount})`;
  if (tab === 'edit') return 'Edit';
  return 'Report';
}
