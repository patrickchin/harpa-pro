# 2026-05-18 — saved-report route rendered "Failed to load report" because the API body wasn't adapted to the UI shape (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** After tapping Finalize on the generate route the app
navigated to the saved-report route, which immediately rendered the
"Failed to load report" error state. The underlying `GET
/reports/:id` succeeded and returned a populated `body`, but the
view treated it as missing.

**Root cause.** The API persists `report_body` in the flat shape
defined by `packages/api-contract/src/schemas/reports.ts#reportBody`
(top-level `siteAddress`, `weather`, `workers`, …). The mobile UI
consumes the nested shape from
`packages/report-core/src/generated-report.ts#GeneratedSiteReportSchema`
(everything wrapped under `report.*`). The generate route was
already passing the API body through `reportBodyToGeneratedReport()`
before rendering, but the saved-report route (`app/(app)/projects/
[project]/reports/[number]/index.tsx`) still had a P4 TODO that left
`displayReport = null` for any non-fixture body. The card layer
treated `null` as load failure.

**Pattern.** R5 — the default wiring (real API body) wasn't on the
happy path of the saved-report view. Fixture-mode rendered fine, so
the unit/integration tests went green and the bug only showed up in
the Maestro flow that signs in and exercises the live stack.

**Fix.**
1. Call `reportBodyToGeneratedReport(reportRow.body)` from the
   saved-report route when `reportRow.body` is present, falling
   back to the fixture sample only in fixture mode.
2. Cover the route with the `p3-report-wiring.yaml` Maestro flow
   that finalizes a real seeded draft and asserts saved-report
   renders Workers / Materials / Issues / Weather correctly.

**Avoiding recurrence.**
- When a UI ↔ API schema mismatch exists, the adapter MUST be
  applied at every consumer, not just the first one. Grep for the
  adapter name when adding a new render site.
- Maestro flows that go through the real API are the contract for
  this — fixture-only tests cannot catch adapter omissions.
