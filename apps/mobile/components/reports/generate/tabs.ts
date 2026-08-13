/**
 * Ported verbatim from
 * `../haru3-reports/apps/mobile/components/reports/generate/tabs.ts`
 * on branch `dev`. Drives the Generate-screen tab state and horizontal
 * pager-index mapping. Debug remains developer-gated by the tab bar.
 */
export const TAB_ORDER = ['notes', 'report', 'debug'] as const;
export type TabKey = (typeof TAB_ORDER)[number];
