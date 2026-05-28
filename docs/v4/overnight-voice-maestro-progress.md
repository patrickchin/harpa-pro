# 2026-05-27 overnight voice Maestro run

Goal: complete the voice-note E2E hardening path and run the Maestro
suite first against the local backend, then against the dev deployment.

## Progress

- [x] Started run and confirmed current blocker state:
  `modules/09-voice-notes.yaml` was disabled in
  `regression-journey.yaml` and only asserted `voice-title-*`.
- [x] Fix fixture recorder asset loading on iOS by replacing the
  runtime dynamic import with a static Metro asset import.
- [x] Expand module 09 to cover title, summary, transcript, playback
  entry point, and delete.
- [x] Re-enable module 09 in the regression journey.
- [x] First local run reached module 09 and proved upload,
  transcribe, summarize, title, transcript, playback entry point, and
  delete-confirm all execute. It then exposed a stale synthetic voice
  row after delete (`Notes (0)` badge, voice card still visible).
- [x] Fix stale synthetic voice row by deleting from the rendered
  timeline item and resetting the saved voice pipeline row when that
  note is deleted.
- [x] Run local backend Maestro suite. Passing log:
  `tmp/mo/runs/maestro-regression-journey-20260526T222127Z.log`.
  Completed modules: 01, 01b, 02, 03, 04, 05, 06, 07, 08,
  09, 14, 15, 16, and final sign-out. Modules 10a/11/12/13
  remain intentionally disabled as documented in the journey.
- [x] Run dev-deployment E2E pass against `harpa-pro-api-dev`.
  2026-05-28 Android result:
  - `https://harpa-pro-api-dev.fly.dev/healthz` was healthy
    (`gitCommit=fefdb4f`, `buildTime=2026-05-26T18:53:11Z`).
  - Dev auth used `scripts/dev-e2e-auth-broker.cjs` so the shared
    test-account password stayed in the CLI process and out of
    Maestro logs.
  - Device API traffic used `scripts/dev-e2e-api-proxy.cjs`; signed
    R2 URLs were rewritten through `scripts/dev-e2e-r2-proxy.cjs`.
  - After fixing the final local-only project-name assertion in module
    10a, a clean full dev run of `regression-journey-dev.yaml` passed
    modules 01, 01b, 02, 03, 04, 05, 06, 07, 08, 09, 10a, project
    cleanup, 14, 15, 16, and sign-out.

## Notes

- Follow-up on 2026-05-28: photo module 10a is no longer paused after
  the upload UI redesign landed. It now covers attachment sheet →
  camera → two-photo upload → generated photo strip → preview →
  delete/cleanup, and passed focused local Android plus the full
  local regression journey. It also passed inside the clean full dev
  regression against real dev Fly/Neon/R2 via the local API/R2 proxy
  bridge.
- Later on 2026-05-28, modules 11/12/13 were restored to both local
  and dev journeys. The fix was Maestro-only: module 11 no longer sends
  a second Android Back-producing `hideKeyboard` after adding the note,
  and it accepts either Generate or Update report CTA IDs. Focused
  local Android passed 01/02/11/12/13, the full local regression passed,
  and the clean full dev-deployment regression passed modules 01, 01b,
  02, 03, 04, 05, 06, 07, 08, 09, 10a, 11, 12, 13, 14, 15, 16, and
  sign-out.
- Dev deployment should use `/auth/password/verify` test accounts, not
  fake OTP or real SMS. Keep the password in the CLI/broker; do not
  pass it to Maestro.
- Verification: focused voice/generate tests pass (`28` tests),
  mobile typecheck and lint are clean after the stale-row fix, and a
  direct Expo iOS export included
  `assets\fixtures\voice-sample.m4a`.
