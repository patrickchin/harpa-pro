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

## No coordinate taps

Do not use `tapOn: { point: ... }` or any `point:` key in `.maestro`
flows. Coordinate taps depend on device size, safe areas, orientation,
and platform chrome. Tap visible text, accessibility labels, or testIDs
instead; add a testID to the app if the target has no stable semantic
selector yet.

The root lint script runs `scripts/check-no-maestro-point-taps.sh`,
which fails on any `.maestro/**/*.yaml` / `.yml` `point:` key.

## `core-end-to-end.yaml` (legacy P3 smoke)

The older P3-exit-gate single-file flow. It still exists as a manual
smoke target, but the normal full-app Maestro suite is now
`regression-journey.yaml` plus `.maestro/modules/*`. This flow walks a
seeded Alice/Bob path on the real `(auth)` + `(app)` routes:

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

Wrap with `gtimeout 240` for longer batches; on a hung XCTest driver,
`kill` the leftover `maestro-driver-ios` PID and retry. Prefer the
modular regression journey for current coverage.

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
10. Generate + finalize: add note, generate/update report, per-card
    edit modal coverage, finalize, unfinalize, re-finalize
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
- 2026-06-14 follow-up: module 10c exercises the attachment picker with
  enough photo groups to scroll and asserts first-photo thumbnails are
  visible. Module 11 verifies regeneration settles with the report still
  mounted; deterministic unit tests pin the disabled write-lock states
  because fixture regeneration can finish before Maestro observes the
  transient lock. The standalone `place-photo-on-issue.flow.yml` also
  finalizes a placed-photo report and asserts the saved-report page keeps
  the placed photo visible without exposing placement or manual-edit
  controls.
- The CI Maestro testID gate is path-filtered on both `apps/mobile/**`
  and `.maestro/**` so E2E-only flow changes still validate referenced
  mobile testIDs.

Modules 14/15/16 navigate to Profile / Account / Usage screens.

## `dev-otp-hardening.yaml` (PR128 focused smoke)

Focused Android/local smoke for the hardened `POST /api/dev/last-otp`
path. It requests Alice's OTP through the real mobile email sign-in UI,
then `helpers/assert-dev-otp-hardening.js` proves the dev introspection
route:

- returns the OTP for the exact allowlisted email with `x-dev-otp-token`;
- rejects missing / bad tokens with 404;
- rejects non-allowlisted, suffix-attack, and wildcard-injection emails
  with 404;
- still lets the app complete sign-in and land on the projects list.

Run with the local compose API and Metro dev-client bundle:

```bash
export DEV_OTP_TOKEN=... # >=32 chars; must match the API container env
export MAESTRO_APP_ID=com.harpa.pro.dev
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8787 tcp:8787
maestro test .maestro/dev-otp-hardening.yaml
```

## `store-screenshots.yaml` (App Store / Play Store assets)

Focused flow for generating store-listing screenshots from polished,
repeatable fixture data. The flow expects
`scripts/maestro/seed-store-screenshots.sh` to seed the local Postgres
database and MinIO bucket first, then captures:

1. projects list
2. reports list
3. members management with a six-person team
4. live voice-note recording state
5. finalized report issues with placed photos
6. finalized report detailed sections and unplaced photos
7. generated PDF preview
8. usage history with limits, OpenAI/Groq model mix, and recent events

Run against the local fixture stack and a screenshot-mode Metro bundle:

```bash
export DEV_OTP_TOKEN=dev-token-at-least-32-characters
export MAESTRO_APP_ID=com.harpa.pro.dev
docker compose down -v && docker compose up -d
scripts/maestro/seed-store-screenshots.sh
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8787 tcp:8787
adb reverse tcp:9000 tcp:9000
EXPO_PUBLIC_API_URL=http://localhost:8787 \
EXPO_PUBLIC_USE_FIXTURES=false \
EXPO_PUBLIC_SCREENSHOT_MODE=true \
pnpm --filter @harpa/mobile start --dev-client
maestro test .maestro/store-screenshots.yaml
```

`EXPO_PUBLIC_USE_FIXTURES=false` keeps report and usage data backed by
the seeded API rows. `EXPO_PUBLIC_SCREENSHOT_MODE=true` hides the status
bar and uses deterministic screenshot-only fixture paths, including the
voice recorder backend and the checked-in construction images documented
in `apps/mobile/assets/fixtures/store-screenshots.md`.

## Archived and pending flows

Top-level `.maestro/*.yaml` files are current entrypoints. Historical
or blocked scenarios live in explicit subdirectories so broad manual
runs do not pick them up by accident.

- `.maestro/legacy/p3-15-upload.yaml`: superseded by modules 10a, 10b,
  and 10c in the normal regression journey. Keep only for debugging the
  old seeded Alice camera/upload path.
- `.maestro/legacy/p3-15-voice-record.yaml`: superseded by
  `modules/09-voice-notes.yaml`. Keep only for debugging the old seeded
  Alice voice path.
- `.maestro/pending/usage-limit-dialog.yaml`: blocked until reset
  tooling can seed Alice at the free-plan limit without spending AI
  tokens.
- `.maestro/pending/usage-near-limit-toast.yaml`: blocked until the
  mobile client surfaces `X-Usage-Warning` as a near-limit toast and
  reset tooling can seed the near-limit state.

The old P3.14a usage-limits-card flow was folded into
`modules/15-usage.yaml`, which now asserts the free-plan limits card
and default buckets as part of `regression-journey.yaml`.

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
