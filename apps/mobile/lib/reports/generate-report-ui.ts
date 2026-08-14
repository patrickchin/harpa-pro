/**
 * Shared label helpers for the Generate Report tab bar. Kept in
 * `lib/` so the tab bar component and any future routing/header logic
 * stay in sync without a dependency cycle.
 *
 * Ported from `../haru3-reports/apps/mobile/lib/generate-report-ui.ts`
 * on branch `dev`. Debug remains behind a developer flag; the removed
 * Generate Edit surface is not part of this label contract.
 */
export function getGenerateReportTabLabel(
  tab: 'notes' | 'report' | 'debug',
  notesCount: number,
): string {
  if (tab === 'notes') return `Notes (${notesCount})`;
  if (tab === 'debug') return 'Debug';
  return 'Report';
}
