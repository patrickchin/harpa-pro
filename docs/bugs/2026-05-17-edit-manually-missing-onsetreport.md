# 2026-05-17 — `btn-edit-manually` switched tabs but didn't seed the empty report (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Tapping "Edit manually" from the Report tab's
empty-state navigated to the Edit tab but the Edit tab still
showed *its* empty-state ("Generate a report first to edit"). The
user could not enter section data manually — which is the whole
point of the button. First caught by `core-end-to-end.yaml`
asserting `edit-section-meta` after tapping `btn-edit-manually`.

**Root cause.** `GenerateReportProvider.editManually` falls back
to `onSetReport(createEmptyReport())` only when the route wired
`onSetReport`. The real `generate.tsx` route owned a local
`setGeneratedReport` setter but never passed it as
`onSetReport={…}` to `<GenerateNotes>`. So the provider's
fallback short-circuited to a no-op and only `setActiveTab('edit')`
fired.

**Fix.** Pass `onSetReport={setGeneratedReport}` from the route.
Now "Edit manually" both creates the empty report skeleton *and*
switches tabs, exactly as the provider docs claim.

**Test.** Covered by the Maestro `core-end-to-end.yaml` flow
asserting `edit-section-meta` is visible after the round-trip.

**Pattern.** R5 — the provider unit tests stubbed `onSetReport`,
so the bug only existed at the wiring layer (Pitfall 13 / Hard
Rule #5: "test the default wiring").
