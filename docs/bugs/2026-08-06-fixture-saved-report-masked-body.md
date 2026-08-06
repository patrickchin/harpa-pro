# 2026-08-06 — Fixture saved report masked persisted body

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The standalone photo-placement flow could place a captured photo
inside a generated draft issue, but the finalized saved-report screen could
never prove persistence. In fixture mode it rendered the static Highland Tower
sample, whose issue contains no attachment mapping.

**Root cause.** The saved-report route selected `SAMPLE_GENERATED_REPORT`
whenever `EXPO_PUBLIC_USE_FIXTURES` was true, even when the API row already had
a generated body. Fixture decoration therefore overrode real local server
state and hid edits, regenerated content, and photo placements after finalize.

**Fix.** `resolveGeneratedReport` gives a persisted report body precedence and
uses the static fixture only while the row's body is absent. The route now
shares that resolver with the report-body adapter instead of short-circuiting
on fixture mode.

**Test.** The adapter unit test supplies a persisted issue with
`attachments.images` plus a conflicting static fallback and asserts the
persisted title and photo ID win. The Maestro flow then places a freshly
uploaded photo, finalizes the report, and requires the placed-photo issue strip
on the saved page.

**Pattern.** Fixture mode may fill missing state, but it must not replace state
returned by the system under test. Prefer real values first and fixtures only
as explicit absence fallbacks.
