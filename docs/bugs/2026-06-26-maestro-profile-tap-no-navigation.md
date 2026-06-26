# Maestro Profile Tap Did Not Navigate Before Sign Out

Date: 2026-06-26

## Symptom

The local iOS release-stress Maestro flow failed in
`.maestro/helpers/sign-out.yaml` during module 01 auth:

```text
Assertion is false: id: btn-sign-out is visible
```

The preceding `tapOn id: btn-open-profile` reported `COMPLETED`, but the
failure screenshot still showed the Projects list with the profile icon.

## Root Cause

iOS XCTest can report the header icon tap as complete while the app remains on
the current screen. The helper then waited directly for `btn-sign-out`, so it
had no recovery path when the profile navigation did not happen.

## Fix

After tapping `btn-open-profile`, wait briefly for animation, retry the profile
tap once if `btn-open-profile` is still visible, then assert `screen-profile`
before waiting for `btn-sign-out`.

## Guardrail

Shared navigation helpers should assert the destination screen, not just the
next action on that screen. For small header-icon taps, retry once when the
source-screen header control is still visible after the first tap.
