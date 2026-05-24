# 2026-05-18 — iOS XCTest cannot deliver `tapOn` to `Pressable` inside a native RN `Modal` (Maestro flakiness)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** A Maestro `tapOn: btn-report-delete` against a
`Pressable` rendered inside `ReportActionsMenu`'s native `<Modal>`
reports COMPLETED, but the `onPress` handler is never invoked.
Adjacent buttons in `AppDialogSheet` (also a Modal) tap fine.

**Root cause.** Suspected interaction between iOS 26.5 XCTest
accessibility resolution and React Native's `Modal` implementation
when the Modal's content uses a `Pressable` directly (vs.
`TouchableOpacity`). XCTest finds the element by accessibilityID
but the synthesised tap is consumed by the Modal's backdrop layer
before reaching the inner view. Unit tests + UI render snapshots
still pass — the wiring is correct; only Maestro's XCTest path is
broken.

**Workaround.** The `p3-report-wiring.yaml` flow asserts the
Delete button is visible inside the action sheet but does not tap
it. The delete mutation is covered by
`apps/mobile/screens/saved-report.test.tsx`.

**Avoiding recurrence.**
- When designing testable destructive-action sheets in the future,
  prefer an inline overlay over a native Modal so Maestro can
  exercise the confirm path.
- Document this limitation in any new Maestro flow that lands on a
  Modal-hosted sheet — point at this entry.
