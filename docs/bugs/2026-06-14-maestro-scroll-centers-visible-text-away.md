# 2026-06-14 - Maestro scrollUntilVisible can scroll visible text away

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The local Android Maestro regression failed in module 11 while
looking for `E2E sealant.*` after saving the materials edit modal.

**Root cause.** The text was already visible immediately after the modal closed.
Maestro logged full element visibility, then `scrollUntilVisible` with
`centerElement: true` swiped to center the element and moved it out of view.
The command then kept scrolling in the same direction until the selector timed
out.

**Fix.** Use a plain `assertVisible` when the edited text should already be in
place, and avoid `centerElement: true` for follow-up text assertions where
centering is not part of the contract.

**Test.** The full Android `.maestro/regression-journey.yaml` reproduced the
failure after module 10c and module 11's regeneration helper had passed.

**Pattern.** Maestro scroll commands are actions, not passive queries. If the
test only needs proof that text is visible, assert it directly or scroll without
centering.

**2026-08-07 recurrence.** The Android regression reached the Workers edit
action after all repeated photo captures, found `btn-edit-workers` fully visible
at the lower edge, then `centerElement: true` issued a full-screen upward swipe.
That moved the button above the viewport; subsequent downward searches could
only move farther away and ended at the report's detailed sections. Unlike the
original text assertion, this leaf action still had to be moved clear of the
sticky recorder. The helper now stops on 100% visibility without centering,
uses one short coordinate-bounded upward gesture, waits for the scroll to
settle, and then taps. The release-confidence policy pins that sequence so an
unbounded centering swipe cannot return.

The following proof reached Materials with `btn-edit-materials` exposed as a
nine-pixel viewport-clipped leaf. Maestro treated those clipped bounds as 100%
visible; the edit still opened, but after save `E2E sealant` remained below the
sticky recorder. Materials now uses the same bounded pre-tap positioning and a
non-centering leaf scroll before the saved-value assertion. This retains the
original rule—never center a passive assertion—while handling the case where
the assertion genuinely starts offscreen.
