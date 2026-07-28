# 2026-07-29 — Expo Dev Launcher did not select Metro

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The PR-time Android launch smoke installed and opened the
development build, but `input-email` never appeared. Successive exact-head runs
reached Maestro and timed out while still in Expo's native launcher UI.

**Root cause.** Clearing app state removed the development build's remembered
server. The deep link registered a reachable Metro instance, but did not select
it: the retained Maestro screenshot showed Dev Launcher's Home screen with a
green `http://10.0.2.2:8081` row. The flow assumed `openLink` always entered the
bundle, so it waited for application UI while still in the native launcher.
After adding the server selection, the cold first bundle took 42 seconds and
the developer-menu `Continue` modal appeared just after a fixed 30-second
probe, obscuring the rendered sign-in control.

**Fix.** After the deep link settles, conditionally tap the advertised
`http://10.0.2.2:8081` row. Then wait up to 60 seconds for either the
first-run `Continue` action or the rendered `Email` label, failing if neither
appears. Dismiss `Continue` / `Close` when present, then allow 30 seconds for
`input-email`. The two waits plus setup remain below the wrapper's 180-second
Maestro ceiling.

**Test.** `release-confidence-gates.test.sh` requires the emulator server
fallback and the bounded post-Metro wait ordering before the app-UI assertion.
The focused Maestro policy, app-id, testID, coordinate-tap, YAML, ShellCheck,
and actionlint checks cover the checked-in contract; the PR-time Android smoke
exercises the real Dev Launcher and Metro connection.
