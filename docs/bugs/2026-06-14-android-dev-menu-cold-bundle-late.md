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

**Fix.** Add an Android-only delayed wait for the intro copy, then tap
the sheet's close affordance directly before the auth-screen wait. Do not
tap `Continue`: it opens the full native dev menu and can leave Maestro
stuck behind another sheet. Apply the same Android-first close behavior
to the shared post-`openLink` helper and the duplicated auth preludes.
Keep the longer cold-start auth wait in the local regression/core launch
flows.

**Test.** The full `.maestro/regression-journey.yaml` reproduced the
failure from a clean compose stack and cleared Metro cache; rerun the
same full journey after the flow hardening.

**Pattern.** Maestro/device fixture drift around Expo dev-client first-run
UI. Keep post-`openLink` helpers defensive against system UI that appears
after the app bundle starts rendering, not only immediately after the
link opens.
