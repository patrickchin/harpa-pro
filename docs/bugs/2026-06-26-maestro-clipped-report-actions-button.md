# 2026-06-26 - Maestro can tap a clipped saved-report actions button

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Local iOS Simulator `.maestro/regression-journey.yaml` passed
through module 10a, then failed in `modules/10b-photo-notes-finalized.yaml`
after tapping `btn-report-actions`: `btn-report-delete` never appeared. The
failure screenshot showed the saved-report actions button partially clipped at
the top edge and no actions menu open.

**Root cause.** The cleanup flow scrolled upward until `btn-report-actions`
was merely visible. Maestro considered the partially clipped header button
tap-complete, but the menu did not open.

**Fix.** In module 10b, require `btn-report-actions` to be fully visible and
centered before tapping. Then wait for `report-actions-menu` before asserting
`btn-report-delete`.

**Test.** Reproduced on iPhone 17 Pro / iOS 26.5 during a full local
regression rerun. Static Maestro checks still passed after the selector-only
flow change.

**Pattern.** When a flow scrolls back to a header action after deep content or
image preview navigation, treat partial visibility as insufficient. Use
`visibilityPercentage: 100`, `centerElement: true`, and assert the opened menu
before tapping menu items.
