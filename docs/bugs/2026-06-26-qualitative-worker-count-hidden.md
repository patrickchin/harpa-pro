# 2026-06-26 — qualitative worker counts hidden as zero

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** If a note said "a few contractors were here today", report generation could preserve `"a few"` in `reportBody.workers[].count`, but the mobile report rendered the role as `0` and the worker summary/stat as `0 on site`.

**Root cause.** The API wire schema had already been widened to `string | null`, but downstream display paths still used numeric-only models: `@harpa/report-core` coerced role counts to `number | null`, the mobile adapter parsed non-numeric counts to `0`, and report cards / stat bars / HTML export only displayed numeric totals.

**Fix.** Keep generated role counts as `string | null` through `GeneratedSiteReport`, preserve the raw count text in the mobile adapter, parse only for aggregate math and bar widths, and fall back to the qualitative phrase in report stats, worker cards, HTML/PDF export, and `ui-voice`.

**Test.** Added coverage in `generated-report.test.ts`, `report-body-adapter.test.ts`, `WorkersCard.test.tsx`, `report-ui.test.ts`, `report-to-html.test.ts`, and `VoiceReportView.test.tsx` for the `"a few"` count path.

**Pattern.** Variant of the 2026-06-06 report-body string-wire bug: widening the wire type is not enough if downstream display models downcast the value before rendering.
