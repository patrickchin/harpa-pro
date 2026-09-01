# Android Maestro Quickstep reliability — design

## Goal

Make the Android launch-smoke check deterministic when the emulator's
Quickstep process displays a recurring application-not-responding dialog,
without weakening the assertion that the Harpa sign-in screen becomes ready.

## Evidence

Recent pull-request artifacts show the same failure pattern at different
points in `.maestro/ci-launch-smoke.yaml`: the Harpa email form or Expo
development-launcher server row is visible, but a system-owned
`Quickstep isn't responding` dialog covers the accessibility surface. The
dialog can recur after Maestro dismisses it, so two fixed conditional taps do
not make the run deterministic. The same application revision has both passed
and failed, which points to emulator-system state rather than a stable product
regression.

## Approaches considered

1. **Suppress system error dialogs on the disposable emulator (selected).**
   Set Android's global `hide_error_dialogs` value before starting Maestro and
   read it back to fail fast if the emulator did not accept the setting. Keep
   the final `input-email` assertion and logcat diagnostics unchanged.
2. Add a bounded Maestro loop that repeatedly looks for and dismisses the
   Quickstep dialog. This still races with dialogs that appear between loop
   iterations and adds timing complexity to the product flow.
3. Change emulator images or resource allocations. This may lower the
   frequency of Quickstep ANRs but does not create a deterministic contract and
   is harder to reproduce locally.

## Design

`scripts/ci/run-maestro-launch-smoke.sh` will configure the already-connected
Android test device with:

```sh
adb shell settings put global hide_error_dialogs 1
```

The runner will immediately read the value back and require exactly `1` before
it launches Maestro. The configuration is scoped to the disposable CI/local
emulator; it does not alter application behavior or production devices.

The existing semantic readiness checks remain intact. Maestro must still reach
and assert `input-email`, so application crashes, Metro failures, and genuine
navigation regressions continue to fail the check. The flow's current
Quickstep dismissal branches remain as defense in depth for environments where
the dialog was already present before the setting took effect.

## Testing

Development follows a regression-first sequence:

1. Extend `scripts/ci/__tests__/release-confidence-gates.test.sh` to require
   the setting, its read-back verification, and ordering before Maestro.
2. Run the policy test and confirm the new expectation fails.
3. Add the runner configuration and confirm the policy test passes.
4. Run the shell policy suite and repeated Android launch-smoke runs on the
   local API 34 emulator.
5. After the PR is merged to `dev`, run the complete non-legacy Maestro suite
   locally and report each flow's result.

## Documentation

Update the Maestro runbook, v4 testing architecture, and recurring-bug index.
The bug note will distinguish the environmental Quickstep failure from a real
Harpa readiness failure and record the verified emulator setting.

## Success criteria

- The runner refuses to invoke Maestro unless Android reports
  `hide_error_dialogs=1`.
- The launch smoke still asserts the Harpa email input.
- Focused policy tests and repeated local launch-smoke runs pass.
- Required PR checks pass before merge into `dev`.
- The merged `dev` branch completes a documented full local Maestro run, or
  any unrelated failures are captured with diagnostics for follow-up.
