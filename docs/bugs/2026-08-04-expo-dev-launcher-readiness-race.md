# 2026-08-04 — Expo Dev Launcher readiness and Quickstep interception

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** PR #255's Android launch smoke installed and launched the
development build, opened the Metro deep link about one second later, skipped
the fallback Metro server row, and never rendered `Continue`, `Email`, or
`input-email`. The bounded app-readiness assertion failed in
[Actions run 30924240940]. After the native readiness boundary was added,
[PR #256's Android job] stopped before `Development Build`: its [diagnostic
artifact] showed `Quickstep isn't responding` over a fully rendered Dev
Launcher, including the `Development Build` heading and green Metro server row.
An [earlier failed attempt] captured the same system dialog, while its retry
passed at the identical head SHA.

**Root cause.** The first verified harness defect was a missing synchronization
boundary: the clear-state flow called `openLink` immediately after `launchApp`
without first asserting that Expo Dev Launcher's native home screen was ready.
The later artifacts prove a separate emulator-system interception: Android's
Quickstep ANR dialog owned the accessibility surface even though the Dev
Launcher beneath it was ready. The green retry at the same application head
confirms this was not a deterministic application failure. This is a new timing
variant of the earlier [unselected Metro server bug].

**Fix.** After clearing app state, wait up to 30 seconds for either the native
`Development Build` heading or the known Quickstep dialog. If Quickstep is
present, tap its semantic `Wait` action and then require `Development Build`
within 30 seconds before opening the Metro deep link. Check for the dialog once
more after `openLink`, before the existing bounded server-row recovery and
app-UI readiness waits. The flow never uses coordinate taps or treats the final
launcher/app assertions as optional.

**Test.** `release-confidence-gates.test.sh` requires the bounded launcher-or-
Quickstep target, exactly two conditional Quickstep checks, exactly two
semantic `Wait` actions, the strict launcher recheck, and their ordering around
`openLink` and the Metro server assertion. The YAML parser covers the
declarative flow. The existing artifacts reproduce the interception; the
updated flow still requires a fresh PR-time Android smoke to validate recovery
on a real emulator.

**Pattern.** Recurrence of the Expo Dev Launcher synchronization failure
documented in the [2026-07-29 bug entry].

[Actions run 30924240940]: https://github.com/patrickchin/harpa-pro/actions/runs/30924240940
[PR #256's Android job]: https://github.com/patrickchin/harpa-pro/actions/runs/30927297133/job/92052876856
[diagnostic artifact]: https://github.com/patrickchin/harpa-pro/actions/runs/30927297133/artifacts/8900218014
[earlier failed attempt]: https://github.com/patrickchin/harpa-pro/actions/runs/30917762954/attempts/1
[unselected Metro server bug]: 2026-07-29-expo-dev-launcher-server-not-selected.md
[2026-07-29 bug entry]: 2026-07-29-expo-dev-launcher-server-not-selected.md
