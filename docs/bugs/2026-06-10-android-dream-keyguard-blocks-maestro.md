# 2026-06-10 — Android DreamActivity/keyguard blocked Maestro auth

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The local Android regression journey failed in module 01
at `Assert that id: input-email is visible`. Maestro screenshots showed
only Samsung's blank DreamActivity gradient, and `dumpsys window`
reported `Bouncer` / `isKeyguardShowing=true` instead of the Harpa
auth screen.

**Root cause.** The physical test device entered Android dream/keyguard
state while the orchestrator was resetting the database, clearing app
data, and opening the Expo dev-client URL. A single
`KEYCODE_WAKEUP` woke the panel but did not keep the device awake or
dismiss dream/keyguard reliably.

**Fix.** `mo run` now prepares Android targets before spawning Maestro:
`svc power stayon true`, disables the `screensaver_*` secure settings,
sends `KEYCODE_WAKEUP` + `KEYCODE_MENU`, and then checks
`dumpsys window`. If DreamActivity or a secure keyguard/bouncer remains,
it fails fast with an unlock-device error instead of letting the journey
fail on the first app selector.

**Test.** `tools/maestro-orchestrator/tests/test_device.py` asserts the
full adb preparation sequence and the locked-keyguard fail-fast branch.
`tools/maestro-orchestrator/tests/test_run.py` asserts `mo run` refuses
before spawning when the device preparation fails.

**Pattern.** E2E infra state drift — physical device state is part of
the test fixture and needs explicit preflight checks, not just app/API
assertions.
