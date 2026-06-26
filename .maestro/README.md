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
seeded test-account path on the real `(auth)` + `(app)` routes:

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
./scripts/maestro/reset-db.sh                      # wipe + seed test users
maestro test .maestro/core-end-to-end.yaml
```

Wrap with `gtimeout 240` for longer batches; on a hung XCTest driver,
`kill` the leftover `maestro-driver-ios` PID and retry. Prefer the
modular regression journey for current coverage.

The flow uses the password-login test accounts
(`test@harpapro.com`, `test2@harpapro.com`, `test3@harpapro.com`).
`helpers/sign-in.yaml` talks to the local auth broker on
`127.0.0.1:8790`, which keeps the shared password out of Maestro logs.
The seeded invite target (`test2@harpapro.com`) is reseeded by
`reset-db.sh` so the invite step always finds a real user. The flow
deletes the project at the end.

## `regression-journey.yaml` (overnight full-coverage journey)

Orchestrator flow that runs every regression module in
`.maestro/modules/` sequentially against a single signed-in test
account. The API seeds `test@harpapro.com`, `test2@harpapro.com`, and
`test3@harpapro.com`; the journey deletes the project and signs out at
the end. Covers:

1. Auth (sign-in test + sign-out + sign-in round-trip)
2. Sign in test2
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
13. Account view + edit-cancel + edit-save + account-deletion cancel
14. Usage screen render
15. Profile identity + nav
16. Sign out

**Pre-condition:** docker compose stack up, auth broker running, Metro
running, app built with `EXPO_PUBLIC_USE_FIXTURES=true`. Microphone and
camera privacy grants are required for modules 09 and 10a. `mo up`
starts the local compose stack, auth broker, and Metro.

On Android devices/emulators, reverse every local port used by the
app and upload pipeline before running. Photo signed URLs point at
the local MinIO endpoint, so `9000` is required in addition to Metro
and the API:

```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8787 tcp:8787
adb reverse tcp:8790 tcp:8790
adb reverse tcp:9000 tcp:9000
```

**Run:**

```bash
docker compose down -v && docker compose up -d   # fresh DB + seeded test accounts
node scripts/dev-e2e-auth-broker.cjs             # or use `mo up`
maestro test .maestro/regression-journey.yaml
```

Dev-deployment target:

- After the local backend run passes, run the same coverage against
  `https://harpa-pro-api-dev.fly.dev`.
- Dev auth uses the local CLI auth broker
  (`scripts/dev-e2e-auth-broker.cjs`) with allowlisted test accounts
  (`TEST_ACCOUNT_EMAILS` + `TEST_ACCOUNT_PASSWORD` in `.env.local` or
  Doppler `dev`), not OTP. Do not pass the password as a Maestro
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

## `native-input-smoke.yaml` (real recorder + camera start)

Focused iOS/Android smoke for native input startup. This covers the
parts that fixture flows deliberately avoid:

- real `expoAudioRecorder` through native microphone permission,
  `prepareToRecordAsync`, recorder start, visible inline recording
  state, and cancel teardown
- real `expo-camera` through camera permission, route mount, shutter,
  thumbnail render, and discard teardown

It does not tap Send or commit captured photos. `modules/09-voice-notes.yaml`
and `modules/10a-photo-notes-draft.yaml` keep deterministic upload,
transcription, summary, playback, image upload, and delete coverage in
fixture mode.

Run against the local API stack and a non-fixture dev-client bundle:

```bash
export MAESTRO_APP_ID=com.harpa.pro.dev
docker compose down -v && docker compose up -d
node scripts/dev-e2e-auth-broker.cjs
EXPO_PUBLIC_USE_FIXTURES=false pnpm --filter @harpa/mobile start --dev-client
xcrun simctl privacy booted grant microphone "$MAESTRO_APP_ID"
xcrun simctl privacy booted grant camera     "$MAESTRO_APP_ID"
maestro test .maestro/native-input-smoke.yaml
```

On Android, also reverse Metro/API ports before running:

```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8787 tcp:8787
adb reverse tcp:8790 tcp:8790
```

## Fixture-gap coverage map

Fixture mode is still the right default for the long regression
journey, but any path it replaces needs one focused non-fixture guard.

| Surface | What fixtures avoid | Non-fixture guard |
| --- | --- | --- |
| Voice recorder | `fixtureRecorder` replaces `expo-audio` in fixture/screenshot builds. | `.maestro/native-input-smoke.yaml` starts/cancels the real recorder; `expoAudioRecorder.test.ts` pins native options. |
| Camera capture | Fixture camera flows make capture deterministic before upload assertions. | `.maestro/native-input-smoke.yaml` opens the real camera route, taps shutter, waits for a thumbnail, then discards. |
| Photo library picker | Screenshot mode resolves seeded image URIs instead of opening the system picker. | `pick-and-enqueue-gallery-images.test.ts` verifies the non-screenshot path calls `expo-image-picker`; keep OS-picker Maestro coverage manual unless we add stable picker automation. |
| R2 storage | API replay mode uses `FixtureStorage` instead of signed object storage. | `files.r2-live.integration.test.ts` runs `/files/presign` plus a real signed PUT against MinIO when `CI_R2_LIVE` is enabled. |
| AI providers | Normal tests replay `packages/ai-fixtures` instead of calling providers. | `.github/workflows/ai-live.yml` runs `pnpm --filter @harpa/api test:live` with `AI_LIVE=1` on prompt/provider-sensitive changes. |
| Auth broker | E2E auth uses the local password broker instead of email delivery. | `mo doctor` checks the broker, and API auth integration tests cover allowlisted password sign-in. |

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
export MAESTRO_APP_ID=com.harpa.pro.dev
docker compose down -v && docker compose up -d
scripts/maestro/seed-store-screenshots.sh
node scripts/dev-e2e-auth-broker.cjs
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8787 tcp:8787
adb reverse tcp:8790 tcp:8790
adb reverse tcp:9000 tcp:9000
adb shell settings put global policy_control immersive.full=*
EXPO_PUBLIC_API_URL=http://localhost:8787 \
EXPO_PUBLIC_USE_FIXTURES=false \
EXPO_PUBLIC_SCREENSHOT_MODE=true \
pnpm --filter @harpa/mobile start --dev-client
maestro test .maestro/store-screenshots.yaml
adb shell settings delete global policy_control || true
```

`EXPO_PUBLIC_USE_FIXTURES=false` keeps report and usage data backed by
the seeded API rows. `EXPO_PUBLIC_SCREENSHOT_MODE=true` uses
deterministic screenshot-only input paths such as the canned voice
recorder backend while leaving system status chrome visible.
Construction images are not bundled into the app; the seed script
uploads the checked-in photos documented in
`apps/mobile/assets/fixtures/store-screenshots.md` to local MinIO.

## `account-deletion.yaml` (focused destructive account deletion)

Focused App Store compliance guard for the destructive success path. The
normal regression journey opens the Account deletion sheet, verifies the
preview/confirmation UI, and cancels so the primary journey account stays
usable. This focused flow signs in as `test3@harpapro.com`, confirms deletion,
and asserts the app returns to the sign-in screen.

Run only against a fresh local database because it permanently deletes the
seeded `test3@harpapro.com` account:

```bash
export MAESTRO_APP_ID=com.harpa.pro.dev
docker compose down -v && docker compose up -d
node scripts/dev-e2e-auth-broker.cjs
maestro test .maestro/account-deletion.yaml
```

## Archived and pending flows

Top-level `.maestro/*.yaml` files are current entrypoints. Historical
or blocked scenarios live in explicit subdirectories so broad manual
runs do not pick them up by accident.

- `.maestro/legacy/p3-15-upload.yaml`: superseded by modules 10a, 10b,
  and 10c in the normal regression journey. Keep only for debugging the
  old seeded test-account camera/upload path.
- `.maestro/legacy/p3-15-voice-record.yaml`: superseded by
  `modules/09-voice-notes.yaml`. Keep only for debugging the old seeded
  test-account voice path.
- `.maestro/pending/usage-limit-dialog.yaml`: blocked until reset
  tooling can seed the test account at the free-plan limit without spending AI
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
- `inputText` / `hideKeyboard` around RN multiline `TextInput` is
  unreliable on iOS XCTest. For `input-note`, tap `btn-add-note` while
  it is visible above the keyboard, then swipe the notes list down to
  dismiss the keyboard and restore the generate chrome.
- For full-screen edit modals, do not require `hideKeyboard` before
  tapping a header action. `btn-edit-modal-save` and
  `btn-edit-modal-cancel` remain visible above the keyboard, so tap
  them directly after input.
- The Generate screen has a sticky note input / voice recorder at the
  bottom. When tapping report-card controls that scroll near the
  bottom edge, require full visibility and use `centerElement: true`
  before `tapOn`; otherwise Maestro can tap the sticky recorder area.

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
