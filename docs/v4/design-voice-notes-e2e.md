# Voice notes E2E goal

**Date:** 2026-05-27
**Status:** Goal / design
**Target:** `.maestro/modules/09-voice-notes.yaml` inside
`.maestro/regression-journey.yaml`

## Context

`origin/dev` currently ends at `fefdb4f`:
`test(maestro): regression-journey on iOS sim + Android`.
That work added module 09 for voice notes, but the module is disabled
in the top-level journey on iOS because the fixture recorder resolves
`voice-sample.m4a` through a Metro dynamic import that fails at
runtime.

The latest photo-upload branch on GitHub,
`origin/agents/photo-upload-pipeline-ui-review` at `8527984`, is a
large design change for the photo upload UI/data shape. Until that
lands, photo module 10a is not a stable E2E target. Do not spend the
next Maestro cycle hardening photo upload assertions against the
current UI.

## Goal

Make voice notes fully end-to-end tested in two stages:

1. **Local backend first:** run the full voice-note journey against the
   local docker-compose API/storage stack with fixture AI replay.
2. **Development deployment second:** after the local run is green,
   run the same enabled Maestro end-to-end suite, including the
   voice-note module, against `harpa-pro-api-dev` and the dev Neon/R2
   environment.

The tests should prove the real mobile app talks to real API and
storage wiring in both environments, not a mocked component path.

## Non-goals

- Photo notes, camera capture, batch image notes, and photo gallery
  assertions while the photo upload redesign is in flight.
- Production deployment E2E. The second stage targets the development
  deployment only.
- Native microphone quality. Fixture mode owns deterministic audio.
- Exhaustive failed-provider branches in Maestro. Keep deterministic
  negative-path coverage in Vitest/API integration tests unless a
  stable device trigger exists.

## Acceptance contract

Module 09 is done when it is enabled in `regression-journey.yaml`,
passes on the supported local E2E host(s), and then passes against
the development deployment. It must verify:

1. **Recording surface.** Tapping `btn-record-start` opens
   `voice-record-strip`, shows `voice-record-duration`, and `Send`
   closes the strip.
2. **Upload path.** The fixture recording goes through the default
   mobile upload pipeline (`presign -> PUT -> register file`) before
   note creation. Do not inject a fake uploader in the E2E path.
3. **Aggregator path.** The app calls
   `POST /reports/{report}/notes/voice`, which transcribes and
   summarizes through AI fixtures, then inserts one `kind='voice'`
   note. API integration tests already pin the DB side effects; the
   device test must exercise the same default wiring.
4. **Saved card content.** The timeline shows a saved
   `VoiceNoteCard` with `voice-title-*` and `voice-summary-*`.
   The title must come from the summarization result, not from a
   hard-coded mobile fallback.
5. **Transcript.** Opening `btn-note-options-*` exposes
   `btn-note-options-view-transcript`, and the transcript stage shows
   `note-options-transcript-text`.
6. **Playback entry point.** The options sheet shows
   `btn-note-options-play` for the saved row, proving a file id is
   present and the signed-URL playback row mounted. Tapping it is in
   scope when it is stable on the target host.
7. **Delete.** The same options sheet can delete the voice note via
   `btn-note-options-delete` -> `btn-note-options-confirm-delete`,
   after which the voice row disappears from `note-timeline`.
8. **Cleanup.** The draft report is deleted and the module returns to
   project home so downstream modules are not coupled to voice state.

## Run modes

### Mode A — Local backend

- API/storage: local docker-compose stack.
- Auth: normal OTP UI with fake Twilio code `000000`.
- AI: fixture replay.
- Reset: local DB/app reset before each run.
- Build: fixture dev-client (`EXPO_PUBLIC_USE_FIXTURES=true`) so the
  recorder emits deterministic audio.

### Mode B — Development deployment

- API/storage: `https://harpa-pro-api-dev.fly.dev`, dev Neon branch,
  and `harpa-pro-dev` R2 bucket.
- Auth: test-account password bypass via
  `POST /auth/password/verify`, gated by `TEST_ACCOUNT_PHONES` and
  `TEST_ACCOUNT_PASSWORD` in Doppler `dev`.
- AI: development deployment settings. If `AI_LIVE=1`, this run is a
  true live-provider smoke for voice transcription/summarization; if
  dev is temporarily set to replay, the run still proves deployed API,
  DB, R2, auth, and mobile wiring.
- Data: use allowlisted Alice/Bob test phones and either create unique
  per-run projects/reports or clean them up at the end. Do not require
  destructive DB truncation on the shared dev branch.
- Build: preview/development app variant pointed at the dev API,
  either through `EXPO_PUBLIC_API_URL` at build time or the
  non-production API base URL override.

Mode B should not replace Mode A. The order is intentional: local
fixture run first for deterministic debugging, dev-deployment run
second for production-shaped wiring.

## Implementation plan

1. Fix the fixture recorder asset loader so `voice-sample.m4a` resolves
   on iOS simulator in a dev-client fixture build. Keep the existing
   unit test around `fixtureRecorder` and add a regression for the new
   resolver shape if it changes.
2. Expand `.maestro/modules/09-voice-notes.yaml` from "title appears"
   to the full acceptance contract above.
3. Re-enable module 09 in `.maestro/regression-journey.yaml`.
4. Add a dev-deployment auth/setup path for Maestro. The preferred
   route is a non-production-only helper that signs in allowlisted
   test accounts through `/auth/password/verify`; it must not affect
   production builds.
5. Add a `mo`/Maestro run mode for the dev deployment that sets the
   API base URL to `https://harpa-pro-api-dev.fly.dev`, uses the
   password-login helper, and avoids local DB truncate assumptions.
6. Keep module 10a commented out until the photo upload UI redesign
   lands and the module can be rewritten against the final
   `attachments[]`/per-tile surface.
7. Update this doc, `.maestro/README.md`, and
   `docs/v4/plan-p4-hardening.md` with the verified host, commit, and
   wallclock once module 09 is green in both modes.

## Guardrails

- This is a default-wiring E2E goal. It complements, but does not
  replace, the existing API integration coverage in
  `packages/api/src/__tests__/voice-aggregator.integration.test.ts`.
- Do not assert transient labels that can flicker too quickly on a
  fast replay run unless the UI provides a stable testID. Prefer
  stable end-state proof: title, summary, transcript, playback row,
  delete.
- If module 11 remains disabled, module 09 must remain self-cleaning
  and must not require finalized-report state.
