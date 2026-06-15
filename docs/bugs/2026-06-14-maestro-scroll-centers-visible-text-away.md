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
