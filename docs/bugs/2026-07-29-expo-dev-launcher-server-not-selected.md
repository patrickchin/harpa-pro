# 2026-07-29 — Expo Dev Launcher did not select Metro

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The PR-time Android launch smoke installed and opened the
development build, but `input-email` never appeared. Successive exact-head runs
reached Maestro and timed out while still in Expo's native launcher UI.
After the launcher-selection fix landed, another exact-head run selected Metro
but exhausted the 60-second fail-closed readiness wait before app UI appeared.

**Root cause.** Clearing app state removed the development build's remembered
server. The deep link registered a reachable Metro instance, but did not select
it: the retained Maestro screenshot showed Dev Launcher's Home screen with a
green `http://10.0.2.2:8081` row. The flow assumed `openLink` always entered the
bundle, so it waited for application UI while still in the native launcher.
After adding the server selection, the cold first bundle took 42 seconds and
the developer-menu `Continue` modal appeared just after a fixed 30-second
probe, obscuring the rendered sign-in control. Hosted-runner cold-bundle time
also varies: [Actions run 30392972244] exhausted the later 60-second readiness
wait while its retained Metro log was still at 90 percent.

**Fix.** After the deep link settles, conditionally tap the advertised
`http://10.0.2.2:8081` row. Then wait up to 90 seconds for either the
first-run `Continue` action or the rendered `Email` label, failing if neither
appears. Dismiss `Continue` / `Close` when present, then allow 30 seconds for
`input-email`. The wrapper retains an independent 180-second ceiling over the
whole Maestro process.

**Test.** `release-confidence-gates.test.sh` binds the fail-closed readiness
target to 90 seconds, the final `input-email` target to 30 seconds, and the
Maestro invocation to its 180-second shell cap. It also requires the emulator
server fallback and bounded post-Metro wait ordering before the app-UI
assertion. The focused Maestro policy, app-id, testID, coordinate-tap, YAML,
ShellCheck, and actionlint checks cover the checked-in contract; the PR-time
Android smoke exercises the real Dev Launcher and Metro connection.

[Actions run 30392972244]: https://github.com/patrickchin/harpa-pro/actions/runs/30392972244
