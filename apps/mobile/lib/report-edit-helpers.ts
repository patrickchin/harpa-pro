/**
 * Pure immutable helpers for editing a `GeneratedSiteReport`.
 *
 * Ported (subset) from
 * `../haru3-reports/apps/mobile/lib/report-edit-helpers.ts` on branch
 * `dev`. P3.7 only needs `createEmptyReport()` for the Report tab
 * "Still missing" skeleton + Edit-tab seed. Slice patches and
 * "Add row" factories land with P3.8 (Edit tab).
 */
import type { GeneratedSiteReport } from '@harpa/report-core';

/**
 * Returns a fresh empty `GeneratedSiteReport` for manual entry flows.
 *
 * Every field is initialized to a value the zod schema accepts, so
 * the result round-trips cleanly through
 * `normalizeGeneratedReportPayload`. Required meta strings (`title`,
 * `summary`) start as `""`; required-but-defaulted `reportType` is
 * seeded with `"site_visit"`. `visitDate` defaults to today (local
 * YYYY-MM-DD) — the overwhelmingly common case is a report for the
 * day it's being created. Nullable slices (`weather`, `workers`)
 * start as `null` so consumers can detect "user hasn't touched this
 * slice yet".
 */
export function createEmptyReport(): GeneratedSiteReport {
  return {
    report: {
      meta: {
        title: '',
        reportType: 'site_visit',
        summary: '',
        // `en-CA` locale formats as YYYY-MM-DD using the device's local
        // timezone — avoids the off-by-one-day surprise that
        // `toISOString().slice(0, 10)` causes near midnight.
        visitDate: new Date().toLocaleDateString('en-CA'),
      },
      weather: null,
      workers: null,
      materials: [],
      issues: [],
      nextSteps: [],
      sections: [],
    },
  };
}
