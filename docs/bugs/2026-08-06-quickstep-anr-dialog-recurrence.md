# 2026-08-06 — Recurring Quickstep ANR dialog interception

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** PR-time Android smoke artifacts repeatedly showed a fully ready
Harpa or Expo Dev Launcher UI behind Android's `Quickstep isn't responding`
dialog. Maestro saw the system dialog instead of the ready application and
could not reach the final sign-in assertion.

**Root cause.** The flow treated the system dialog as a finite sequence. Its
two conditional semantic `Wait` actions covered the launcher and post-link
transitions, but Quickstep could raise the ANR dialog again after either
check. Adding another fixed-count dismissal would only move the race; the
emulator environment still controlled whether and when the dialog returned.

**Fix.** The CI runner now writes Android's global
`hide_error_dialogs=1` setting on the disposable test emulator, reads it back,
and exits before installing the APK unless the value is exactly `1`. The flow
retains both semantic Quickstep `Wait` fallbacks for recovery if a dialog is
already present, and it still finishes with a strict `input-email` assertion.

**Test.** `release-confidence-gates.test.sh` pins the global-setting write,
read-back verification, fail-closed mismatch branch, and ordering before the
Maestro flow. Its existing assertions keep exactly two semantic Quickstep
fallbacks, the 420-second Maestro ceiling, and the final `input-email` wait and
assertion.

**Pattern.** Recurrence of the Expo Dev Launcher synchronization failure in
the [2026-08-04 bug entry]. Environment-owned system UI cannot be made reliable
by guessing a maximum number of dismissals. Suppress it at the disposable
emulator boundary, verify that suppression before the test, keep semantic
recovery paths, and require the application assertion to pass.

[2026-08-04 bug entry]: 2026-08-04-expo-dev-launcher-readiness-race.md
