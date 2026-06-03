# Maestro flows

End-to-end mobile flows run via [Maestro](https://maestro.mobile.dev/).

## App id (`MAESTRO_APP_ID`)

Every flow declares `appId: ${MAESTRO_APP_ID}` instead of a literal
bundle id. Export the right value before running Maestro:

```bash
export MAESTRO_APP_ID=com.harpa.pro          # prod / EAS production
# export MAESTRO_APP_ID=com.harpa.pro.dev    # dev variant (when bumped)
```

The CI lint job (`scripts/check-maestro-appid.sh`) fails if any
`.maestro/**/*.yaml` reintroduces a literal `com.harpa.pro`. See
`docs/bugs/README.md` (R-Maestro1) for the regression that motivated
the env-var rule.

## `core-end-to-end.yaml` (canonical full journey)

The P3-exit-gate full-journey flow. Walks every currently-shipped
user-visible feature on the real `(auth)` + `(app)` routes:

- sign-in → onboarding (fresh account each run, via `scripts/maestro/reset-db.sh`)
- projects list, new project, copy buttons
- members: invite (editor role), filter buttons, back
- project edit + save
- reports list + new report
- generate report tabs: notes (voice record), report (edit-manually),
  edit (7 section cards), finalize confirm dialog
- attachment picker dialog (open + cancel)
- project delete (cleanup)

**Setup (one-time per box):**

```bash
docker compose up -d
pnpm --filter @harpa/mobile start --dev-client     # real API mode
xcrun simctl privacy booted grant microphone "$MAESTRO_APP_ID"
xcrun simctl privacy booted grant camera     "$MAESTRO_APP_ID"
```

**Run:**

```bash
./scripts/maestro/reset-db.sh                      # wipe + seed user B
maestro test .maestro/core-end-to-end.yaml
```

Stability seen locally (after fixing the deep-link race and the
filter-button hang): **5/5 PASS** in a row. Wrap with `gtimeout 240`
for longer batches; on a hung XCTest driver, `kill` the leftover
`maestro-driver-ios` PID and retry.

The flow uses better-auth email-OTP. `helpers/sign-in.yaml` reads the
most recent OTP that better-auth persisted to `public.verification`
via the dev-only `POST /api/dev/last-otp` endpoint (mounted whenever
`NODE_ENV !== 'production'`). The seeded invite target
(`bob@e2e.harpapro.com`, Bob Editor) is reseeded by `reset-db.sh` so the
invite step always finds a real user. The flow deletes the project
at the end.

## `regression-journey.yaml` (overnight full-coverage journey)

Orchestrator flow that runs every regression module in
`.maestro/modules/` sequentially against a single signed-in alice
(no `reset-db.sh` needed — it auto-creates alice + bob via the
better-auth emailOtp first-verify path, then deletes the project +
signs out at the end). Covers:

1. Auth (sign-in alice + sign-out + sign-in round-trip)
2. Create bob
3. Projects CRUD
4. Members invite / permissions / viewer / remove
5. Reports CRUD
6. Text notes (add/delete)
7. Voice notes: upload, transcript, summary, playback entry point,
    delete
8. Photo notes: attachment sheet, camera upload, generated report
    photo strip, preview, delete
9. Finalized photo report: saved-report photo strip and preview
10. Generate + finalize: add note, generate/update report, finalize,
   unfinalize, re-finalize
11. Report Debug: prompt, report notes, LLM response, non-empty state
12. Project delete teardown
13. Account view + edit-cancel + edit-save
14. Usage screen render
15. Profile identity + nav
16. Sign out

**Pre-condition:** docker compose stack up, Metro running, app built
with `EXPO_PUBLIC_USE_FIXTURES=true`. Microphone and camera privacy
grants are required for modules 09 and 10a.

On Android devices/emulators, reverse every local port used by the
app and upload pipeline before running. Photo signed URLs point at
the local MinIO endpoint, so `9000` is required in addition to Metro
and the API:

```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8787 tcp:8787
adb reverse tcp:9000 tcp:9000
```

**Run:**

```bash
docker compose down -v && docker compose up -d   # fresh DB
maestro test .maestro/regression-journey.yaml
```

Dev-deployment target:

- After the local backend run passes, run the same coverage against
  `https://harpa-pro-api-dev.fly.dev`.
- Dev auth uses the local CLI auth broker
  (`scripts/dev-e2e-auth-broker.cjs`) with allowlisted test accounts
  (`TEST_ACCOUNT_EMAILS` + `TEST_ACCOUNT_PASSWORD` in `.env.local` or
  Doppler `dev`), not email-OTP. Do not pass the password as a Maestro
  env var or `inputText`: Maestro debug logs evaluated values.
- On Android, run Metro with `--host lan --port 8082`, reverse
  `8082`, and use the local API/R2 proxies:
  `scripts/dev-e2e-api-proxy.cjs` on `8788`,
  `scripts/dev-e2e-r2-proxy.cjs` on `8791`, plus the auth broker on
  `8790`.
- Dev runs must create unique per-run data and clean it up in-flow;
  they must not truncate the shared dev database.
- `mo journey --target dev` is the intended future entry point once
  the orchestrator grows target support.
- 2026-05-28 status: local Android regression is green with modules
  09, 10a, 11, 12, and 13 enabled. A clean dev-deployment Android run
  of `regression-journey-dev.yaml` also passed end to end after the
  dynamic dev-project recovery fix: modules 01, 01b, 02, 03, 04, 05,
  06, 07, 08, 09, 10a, 11, 12, 13, 14, 15, 16, and sign-out. R2
  upload/download traffic went through the local R2 proxy.
- 2026-05-28 follow-up: module 10b adds finalized saved-report photo
  coverage. It creates a photo-bearing report, finalizes it, asserts
  `report-photos`, opens the saved-report image preview by fileId,
  then deletes the finalized report before the rest of the journey.
  Focused local Android passed 01/02/10b, the full local regression
  passed with 10b included, and a clean full dev-deployment Android
  run passed against `harpa-pro-api-dev` (`gitCommit=9db5b51`).
- The CI Maestro testID gate is path-filtered on both `apps/mobile/**`
  and `.maestro/**` so E2E-only flow changes still validate referenced
  mobile testIDs.

Modules 14/15/16 navigate to Profile / Account / Usage screens.

## `p3-15-upload.yaml` (legacy — superseded by module 10a)

Same photo pipeline as `modules/10a-photo-notes-draft.yaml` but
signs in as seeded `alice@e2e.harpapro.com` (requires `reset-db.sh`).
Kept for one-off iteration on the camera path; safe to delete once
module 10a is green in CI.

## `p3-15-voice-record.yaml` (legacy — superseded by module 09)

Same voice pipeline as `modules/09-voice-notes.yaml` but signs in as
seeded `alice@e2e.harpapro.com`. Kept for one-off iteration; safe to delete
once module 09 is green on CI.

## `p3-14a-usage-limits-card.yaml`, `p3-14b-usage-limit-dialog.yaml`, `p3-14c-near-limit-toast.yaml`

Phase-3 usage-limits flows. 14a runs today against seeded alice;
14b/14c are placeholders awaiting a `--seed-at-limit` reset script
and a near-limit toast UI respectively. See each flow's header for
status.

## iOS sim quirks

- `clearState: true` does NOT clear iOS Keychain. Must also pass
  `clearKeychain: true` to force-logout (JWT lives in
  `expo-secure-store`).
- `harpa://path` (single slash) works; `harpa:///path` (triple
  slash) does not navigate.
- `back` (hardware) does nothing on iOS — use `tapOn id: btn-back`.
- Software keyboard occludes bottom buttons; use `hideKeyboard` +
  `scrollUntilVisible` before tapping `btn-save-project` /
  `btn-delete-project`.
- `inputText` into RN multiline `TextInput` is unreliable on iOS
  XCTest — modules 08 + 11 do this for `input-note` and pass, but if
  this becomes a flake source, move the assertion into unit tests
  (`screens/generate-notes.test.tsx`).

## Known infra quirks

- XCUITest driver occasionally returns `kAXErrorInvalidUIElement`
  and Maestro hangs retrying. Mitigation: wrap `maestro test` in
  `gtimeout 240s` and `kill` the leftover `maestro-driver-ios`
  xcodebuild process between attempts. Roughly 1-in-5 frequency on
  iPhone 17 Pro / iOS 26.5 sim.

```bash
# coreutils provides gtimeout (brew install coreutils)
for i in $(seq 1 N); do
  gtimeout 600 maestro test .maestro/regression-journey.yaml || {
    for PID in $(ps aux | grep maestro-driver-ios | grep -v grep | awk '{print $2}'); do
      kill "$PID" 2>/dev/null
    done
    sleep 5
  }
done
```

## `tmp-p3-smoke/`

Throwaway visual smoke flow targeting the `(dev)` gallery from
P3.1–P3.5. The `(dev)` routes were removed in PR #57 — this folder
will be deleted at the next cleanup pass.
