# 2026-06-26 - Maestro can tap the sticky recorder instead of report edit buttons

**Symptom.** Local iOS `regression-journey.yaml` failed in
`modules/11-generate-finalize.yaml` while running
`helpers/edit-report-cards.yaml`. The helper tapped `btn-edit-issue-.*`,
then timed out waiting for `input-edit-issue-title`.

**Root cause.** The issue edit button existed, but Maestro stopped scrolling
with the button at `y=784` on the iPhone 17 Pro simulator. That was inside the
Generate screen's sticky note input / recorder region. The tap did not open the
edit modal; the failure screenshot showed the recorder strip active and the
issue section clipped at the bottom.

**Fix.** Center per-item report edit controls before tapping them, then wait
for the first body input instead of the modal root. The full-screen edit sheet
is visible on iOS even when its `report-edit-modal` wrapper is not a reliable
Maestro selector. Keep this centering for buttons and controls, not for
follow-up text assertions that may already be visible.

**Pattern.** A Maestro "100% visible" report is not enough when a sticky bottom
control can overlap the target. For tappable controls near the bottom edge, use
`visibilityPercentage: 100` plus `centerElement: true`.
