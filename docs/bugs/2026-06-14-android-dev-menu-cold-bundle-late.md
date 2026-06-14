# 2026-06-14 — Android dev-menu sheet appears after cold Metro bundle

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The local Android Maestro regression journey failed in
module 01 at `input-email` even though the screenshot showed the auth
screen had loaded. Expo's "This is the developer menu" sheet was still
covering the app.

**Root cause.** The regression auth prelude dismissed Expo/system UI
once after `openLink`, then immediately waited for `input-email`. On a
cold Metro bundle after `clearState: true`, the dev-menu onboarding sheet
can appear after that single dismissal pass, making the underlying email
field not visible to Maestro.

**Fix.** Add Expo's `disableOnboarding=1` query param to the encoded
Metro URL inside the dev-client deep link so the native dev-menu
onboarding sheet is marked complete before the app bundle loads. Keep
the shared post-`openLink` helper and duplicated auth preludes defensive
with label-based `Continue` / `Close` fallbacks for older dev-clients or
system UI, but do not use coordinate taps — they are device-dependent.
Keep the longer cold-start auth wait in the local regression/core launch
flows.

**Test.** The full `.maestro/regression-journey.yaml` reproduced the
failure from a clean compose stack and cleared Metro cache; rerun the
same full journey after the flow hardening.

**Pattern.** Maestro/device fixture drift around Expo dev-client first-run
UI. Keep post-`openLink` helpers defensive against system UI that appears
after the app bundle starts rendering, not only immediately after the
link opens.
