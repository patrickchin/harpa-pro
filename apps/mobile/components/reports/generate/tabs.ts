/**
 * Ported verbatim from
 * `../haru3-reports/apps/mobile/components/reports/generate/tabs.ts`
 * on branch `dev`. Drives both the Generate-screen tab bar order and the
 * horizontal pager-index → tab-key mapping in `GenerateReportProvider`.
 */
export const TAB_ORDER = ['notes', 'report', 'edit'] as const;
export type TabKey = (typeof TAB_ORDER)[number];
