# 2026-07-29 — Expo Dev Launcher did not select Metro

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The PR-time Android launch smoke installed and opened the
development build, but `input-email` never appeared. Two exact-head runs
reached Maestro and timed out after the Expo onboarding fallbacks were skipped.

**Root cause.** Clearing app state removed the development build's remembered
server. The deep link registered a reachable Metro instance, but did not select
it: the retained Maestro screenshot showed Dev Launcher's Home screen with a
green `http://10.0.2.2:8081` row. The flow assumed `openLink` always entered the
bundle, so it waited for application UI while still in the native launcher.

**Fix.** After the deep link settles, conditionally tap the advertised
`http://10.0.2.2:8081` row before handling Expo's optional onboarding and
waiting for `input-email`. Keep the step conditional so a deep link that enters
the bundle directly does not incur an extra action.

**Test.** `release-confidence-gates.test.sh` requires the emulator server
fallback before the app-UI assertion. The focused Maestro policy, app-id,
testID, coordinate-tap, YAML, ShellCheck, and actionlint checks cover the
checked-in contract; the PR-time Android smoke exercises the real Dev Launcher
and Metro connection.
