# 2026-08-07 — Maestro accepts a clipped parent card as fully visible

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** A fresh Android regression run captured, uploaded, generated, and
finalized two photos, then failed because `report-photos-grid` was not visible.
The failure screenshot showed healthy finalized-report content and only the
edge of the Photos card at the bottom of the screen.

**Root cause.** `scrollUntilVisible` targeted the tall outer `report-photos`
card. Android exposed that node with viewport-clipped bounds of only 37 pixels,
and Maestro calculated the clipped sliver as 100% visible. It stopped scrolling
while the nested grid and both persisted photo buttons remained below the
2400-pixel viewport. This is the parent-container variant of the clipped action
described in
[`2026-06-26-maestro-clipped-report-actions-button.md`](2026-06-26-maestro-clipped-report-actions-button.md).

**Fix.** Module 10b now scrolls directly to a bounded `btn-report-photo-.*`
leaf with full visibility and `centerElement: true`, then asserts both the grid
and tile before opening the preview. The store-screenshot flow uses the same
leaf-first positioning before capturing its final-report photo section.

**Test.** The release-confidence policy requires the leaf selector to precede
the grid assertion and pins full visibility plus centering. The Android
regression journey provides the behavioral proof on a fresh emulator and
database.

**Pattern.** Do not use a tall parent container as a Maestro scroll target when
the next assertion or tap is on a child. Position a bounded leaf control in the
safe viewport first, then assert the surrounding structure.
