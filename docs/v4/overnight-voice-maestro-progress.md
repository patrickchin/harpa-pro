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
- [ ] Run dev-deployment E2E pass against `harpa-pro-api-dev`.
  Blocked in this workspace:
  - `https://harpa-pro-api-dev.fly.dev/healthz` is healthy
    (`gitCommit=fefdb4f`, `buildTime=2026-05-26T18:53:11Z`).
  - `/auth/password/verify` is enabled on dev: a wrong-password probe
    returns `401` rather than `404`.
  - No `TEST_ACCOUNT_PASSWORD`, `TEST_ACCOUNT_PHONES`,
    `MAESTRO_DEV_TEST_ACCOUNT_PASSWORD`, or
    `MAESTRO_DEV_TEST_ACCOUNT_PHONES` are present in the local env.
  - `mo journey --target dev` is not implemented (`No such option
    '--target'`), and current Maestro sign-up/OTP helpers are
    local-only.

## Notes

- Photo module 10a remains paused because
  `agents/photo-upload-pipeline-ui-review` redesigns that surface.
- Dev deployment should use `/auth/password/verify` test accounts, not
  fake OTP or real SMS.
- Verification: focused voice/generate tests pass (`28` tests),
  mobile typecheck and lint are clean after the stale-row fix, and a
  direct Expo iOS export included
  `assets\fixtures\voice-sample.m4a`.
