# 2026-08-04 — Expo Dev Launcher readiness race

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** PR #255's Android launch smoke installed and launched the
development build, opened the Metro deep link about one second later, skipped
the fallback Metro server row, and never rendered `Continue`, `Email`, or
`input-email`. The bounded app-readiness assertion failed in
[Actions run 30924240940].

**Root cause.** The clear-state flow called `openLink` immediately after
`launchApp`. Completion of the launch command did not prove that Expo Dev
Launcher's native home screen was ready to receive a development-client URL,
so URL delivery could race Android's initial `ACTION_MAIN` transition. The run
log proves the missing synchronization and the resulting failure sequence; it
does not expose Android's internal URL-dispatch decision. This is a new timing
variant of the earlier [unselected Metro server bug].

**Fix.** After clearing app state, wait up to 30 seconds for the native
`Development Build` screen before opening the Metro deep link. Keep the
existing bounded server-row recovery and app-UI readiness waits after the
link.

**Test.** `release-confidence-gates.test.sh` requires the launcher readiness
target, binds it to 30 seconds, and proves it appears after `clearState: true`
but before `openLink`. The YAML parser and PR-time Android smoke cover the
declarative flow and real device behavior respectively.

**Pattern.** Recurrence of the Expo Dev Launcher synchronization failure
documented in the [2026-07-29 bug entry].

[Actions run 30924240940]: https://github.com/patrickchin/harpa-pro/actions/runs/30924240940
[unselected Metro server bug]: 2026-07-29-expo-dev-launcher-server-not-selected.md
[2026-07-29 bug entry]: 2026-07-29-expo-dev-launcher-server-not-selected.md
