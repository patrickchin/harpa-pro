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

The first post-merge overnight local regression on 2026-08-06 reproduced the
original synchronization failure outside CI. Maestro delivered the Metro
intent before `DevLauncherController` initialized, Metro received no bundle
request, and the final screenshot showed a healthy green
`http://10.0.2.2:8081` row on the Development Build picker. The modular local
flow had retained its older duplicated launch prelude instead of the CI
smoke's readiness and server-selection boundaries.

**Root cause.** The #255 log proves a harness design gap: the clear-state flow
called `openLink` immediately after `launchApp` without first observing Expo
Dev Launcher readiness. Its [diagnostic artifact][PR #255 diagnostic artifact]
was uploaded but could not be retrieved and inspected during this
investigation, so that run does not prove whether Android discarded the URL,
Quickstep intercepted the flow, or another timing mechanism caused the later
app-readiness failure. The #256 artifact does prove an emulator-system
interception in that run: Android's Quickstep ANR dialog owned the
accessibility surface even though the Dev Launcher beneath it was ready. The
earlier same-head failure followed by a green retry confirms the Quickstep
condition is nondeterministic. This is a new timing variant of the earlier
[unselected Metro server bug].

The local recurrence was the first mechanism above: Android accepted the
`VIEW` intent, but Expo's controller initialized roughly two seconds later and
returned to the picker. This was a Maestro synchronization defect, not an app,
Metro, API, or authentication failure.

**Fix.** After clearing app state, wait up to 30 seconds for either the native
`Development Build` heading or the known Quickstep dialog. If Quickstep is
present, tap its semantic `Wait` action and then require `Development Build`
within 30 seconds before opening the Metro deep link. After `openLink`, observe
for up to 90 seconds until Quickstep, the Metro server row, or app UI is
visible; then recover Quickstep conditionally before the existing server-row
selection and app-UI readiness assertion. The flow never uses coordinate taps
or treats the final launcher/app assertions as optional. The independent
Maestro process ceiling is 420 seconds, within the job's 30-minute limit, so
the declared fail-closed waits can finish instead of being killed at 180
seconds.

Local fixture entrypoints now delegate their clear-state launch to
`.maestro/helpers/launch-local-dev-client.yaml`. The helper observes native
launcher or app readiness before `openLink`, recovers Quickstep semantically at
both transitions, conditionally selects the emulator's discovered Metro row
after the link, and still requires `input-email`. Its post-link waits allow
three minutes because the reproduced cache-empty Windows bundle took 106
seconds, beyond the former 90-second limit. Every onboarding-aware wait accepts
both Expo actions (`Continue` and `Close`) before the semantic dismissal pass,
so a late Close sheet cannot consume the whole readiness budget. This removes
the duplicated older preludes from the modular auth, legacy core,
account-deletion, and store-screenshot entrypoints. The standalone
photo-placement flow reaches the same helper through modular auth; the
shared-dev deployment retains its target-specific port-8082 prelude.

**Test.** `release-confidence-gates.test.sh` requires the bounded launcher-or-
Quickstep target, exactly two conditional Quickstep checks, exactly two
semantic `Wait` actions, the strict launcher recheck, and their ordering around
`openLink` and the Metro server assertion. It also locks the 90-second bounded
post-link observation and 420-second process ceiling. The YAML parser covers
the declarative flow. The existing artifacts reproduce the interception; the
updated flow still requires a fresh PR-time Android smoke to validate recovery
on a real emulator.

The same policy test now requires the named local fixture entrypoints to use
the shared helper and pins its readiness, actual row tap, and strict final
assertion ordering. A fresh wiped-emulator module-01 run is the behavioral
regression check before the full overnight suite resumes.

**Pattern.** Recurrence of the Expo Dev Launcher synchronization failure
documented in the [2026-07-29 bug entry]. A [2026-08-06 follow-up] records why
fixed-count semantic dismissals still raced a recurring Quickstep dialog and
moved suppression into the verified emulator setup.

[Actions run 30924240940]: https://github.com/patrickchin/harpa-pro/actions/runs/30924240940
[PR #255 diagnostic artifact]: https://github.com/patrickchin/harpa-pro/actions/runs/30924240940/artifacts/8899016750
[PR #256's Android job]: https://github.com/patrickchin/harpa-pro/actions/runs/30927297133/job/92052876856
[diagnostic artifact]: https://github.com/patrickchin/harpa-pro/actions/runs/30927297133/artifacts/8900218014
[earlier failed attempt]: https://github.com/patrickchin/harpa-pro/actions/runs/30917762954/attempts/1
[unselected Metro server bug]: 2026-07-29-expo-dev-launcher-server-not-selected.md
[2026-07-29 bug entry]: 2026-07-29-expo-dev-launcher-server-not-selected.md
[2026-08-06 follow-up]: 2026-08-06-quickstep-anr-dialog-recurrence.md
