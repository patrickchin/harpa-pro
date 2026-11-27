# 2026-09-22 - iOS review keyboard overlays the Maestro submit target

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The full iOS Maestro regression reached the finalized-report
review composer, entered a comment, and timed out waiting for the submitted
comment. The failure screenshot still showed the software keyboard and the
empty review state.

**Root cause.** On iOS 26.5, Maestro's `hideKeyboard` command can complete
without blurring this multiline React Native input. XCTest still resolves the
off-screen `btn-add-report-review-comment` node, but its coordinates are under
the keyboard, so the following semantic tap does not reach the app button.

**Fix.** The iOS flow taps the known `report-review-pane` background after
entry. That unhandled semantic background tap blurs the composer and exposes
the actual submit button. Android retains `hideKeyboard`. The comment uses a
short deterministic value and is asserted both after creation and after the
unfinalize/refinalize round trip.

**Test.** Reproduced on iPhone 17 Pro / iOS 26.5. A focused probe confirmed the
keyboard remained after `hideKeyboard`, then confirmed that tapping
`report-review-pane` dismissed it and a semantic button tap created the review
comment. The complete regression covers the round trip.

**Pattern.** When an iOS multiline input's submit control is below the keyboard,
blur with a stable semantic background element before tapping submit. Do not
trust command completion alone as proof that the keyboard is gone.
