# 2026-09-22 — Xcode 27 omits iOS native dialogs from Maestro's hierarchy

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The full iOS Maestro regression opened the delete-draft sheet and
showed the expected Delete button in its screenshot, but
`dialog-action-confirm-delete-draft` never became visible to Maestro. The
captured XCTest hierarchy contained only empty full-screen app containers and
the system status bar. A clean rerun failed at the identical assertion.
After that boundary was handled, the same omission recurred for both stages of
the note-options delete flow while their actions were visibly rendered.

**Root cause.** React Native hosts `Modal` content in a separate native window.
With the app built by Xcode 27 and run on iOS 26.5, XCTest returned the main app
window and status bar but omitted that modal window. The failure persisted
after clean simulator/app/database resets and after explicitly disabling
accessibility grouping on the backdrop and responder wrappers, so the rendered
component tree was not the cause. This is the newer-toolchain recurrence of
the native-modal XCTest boundary already recorded in May.

**Fix.** Centralize the platform boundary in
`.maestro/helpers/tap-dialog-action.yaml` and `tap-dialog-cancel.yaml`. Android
keeps semantic test-ID waits and taps. iOS waits for sheet animation and taps
the stable full-width action row at one strictly allowlisted relative point.
Draft confirmation and note deletion compose that primitive, and finalize,
unfinalize, member removal, report/project deletion, camera discard, and
account cancellation use it directly. Every caller retains a screen-specific
success or cancellation assertion.

**Test.** Maestro syntax, the coordinate-guard self-test, and
release-confidence policy pin both generic helpers, their platform branches,
the composed delete helpers, and their callers. The full
`.maestro/regression-journey.yaml` runs on an iPhone 17 Pro / iOS 26.5 simulator
before the production merge.

**Pattern.** Recurrence of the native React Native `Modal` / iOS XCTest
accessibility boundary documented in
[`2026-05-18-maestro-modal-pressable-tap.md`](2026-05-18-maestro-modal-pressable-tap.md).
Prefer semantic selectors, but keep a single shared, result-asserting fallback
when XCTest cannot expose a native modal window at all.
