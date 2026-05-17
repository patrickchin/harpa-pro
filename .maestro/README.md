# Maestro flows

End-to-end mobile flows run via [Maestro](https://maestro.mobile.dev/).

## `core-end-to-end.yaml` (canonical full journey)

The P3-exit-gate full-journey flow. Walks every currently-shipped
user-visible feature on the real `(auth)` + `(app)` routes:

- sign-up → onboarding (fresh account each run, via `scripts/maestro/reset-db.sh`)
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
xcrun simctl privacy booted grant microphone com.harpa.pro
xcrun simctl privacy booted grant camera     com.harpa.pro
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

The flow uses fake OTP `000000` (via `TWILIO_VERIFY_FAKE_CODE` in
fixture mode). The seeded invite target (`+15550100200`, Bob Editor)
is reseeded by `reset-db.sh` so the invite step always finds a real
user. The flow deletes the project at the end.

## `p3-action-buttons.yaml` (legacy, kept for diff context)

Predecessor to `core-end-to-end.yaml`. Covers fewer features
(sign-in only, no invite role filter, no edit-manually). Kept around
until `core-end-to-end.yaml` is wired into CI; safe to delete after.

**Setup (one-time):**

```bash
# 1. Bring up the local fixture backend (Postgres + Hono API, port 8787).
docker compose up -d

# 2. Start Metro for the dev-client iOS build (real API mode — no
#    EXPO_PUBLIC_USE_FIXTURES so the app talks to docker compose).
pnpm --filter @harpa/mobile start --dev-client
```

**Run:**

```bash
maestro test .maestro/p3-action-buttons.yaml
```

For long batched runs, wrap with `gtimeout` to recover from
occasional XCUITest driver hangs (see "Known infra quirks"):

```bash
# coreutils provides gtimeout (brew install coreutils)
for i in $(seq 1 N); do
  gtimeout 240 maestro test .maestro/p3-action-buttons.yaml || {
    # kill any leftover xcodebuild test-without-building drivers
    for PID in $(ps aux | grep maestro-driver-ios | grep -v grep | awk '{print $2}'); do
      kill "$PID" 2>/dev/null
    done
    sleep 5
  }
done
```

Stability seen locally: ~8/10 runs PASS, 0/10 logic failures,
~2/10 infra hangs (recovered by killing the leftover xcodebuild
driver process).

The flow uses fake OTP `000000` (via `TWILIO_VERIFY_FAKE_CODE` in
fixture mode) and creates a fresh project per run that it deletes at
the end via the real `dialog-action-0` confirm button.

**Coverage:**

- `(auth)`: `input-phone`, `btn-login-send-code`, `input-otp`, `btn-verify-code`
- onboarding (conditional): `input-onboarding-name`, `input-onboarding-company`, `btn-onboarding-submit`
- projects list: `btn-new-project`
- project new: `input-project-name`, `input-client-name`, `input-project-address`, `btn-submit-project`
- project home: `btn-copy-client`, `btn-copy-address`, `btn-open-reports`, `btn-open-members`, `btn-edit-project`, `btn-back`
- members: `btn-add-member`, `input-invite-phone`, `btn-invite-submit`
- project edit: `input-edit-project-name`, `btn-save-project`, `btn-delete-project`, `dialog-action-0` (confirm delete)
- reports list: `btn-new-report`, `report-row-draft-0`
- generate report: `btn-tab-report`, `btn-tab-edit`, `btn-tab-notes`, `btn-attachment`

**Known gaps (intentionally skipped due to iOS XCTest/RN quirks):**

- `input-note` typing: iOS XCTest cannot reliably enter text into RN
  multiline `TextInput` even with hardware keyboard disabled. The
  `btn-add-note` add-note path is therefore covered by unit tests
  (`screens/generate-notes.test.tsx`) rather than Maestro.
- `dialog-action-1` (Cancel) on `AppDialogSheet`: tap reports
  COMPLETED but the action's `onPress` doesn't fire — likely an RN
  `Modal` + XCTest interaction quirk. Covered by
  `screens/project-edit.test.tsx` unit tests.
- `btn-record-start` (voice): audio permission popup blocks
  unattended runs.

**iOS sim quirks discovered:**

- `clearState: true` does NOT clear iOS Keychain. Must also pass
  `clearKeychain: true` to force-logout (JWT lives in
  `expo-secure-store`).
- `harpa://path` (single slash) works; `harpa:///path` (triple
  slash) does not navigate.
- `back` (hardware) does nothing on iOS — use `tapOn id: btn-back`.
- Software keyboard occludes bottom buttons; use `hideKeyboard` +
  `scrollUntilVisible` before tapping `btn-save-project` /
  `btn-delete-project`.

**Known infra quirks:**

- XCUITest driver occasionally returns
  `kAXErrorInvalidUIElement` and Maestro hangs retrying. Mitigation:
  wrap `maestro test` in `gtimeout 240s` and `kill` the leftover
  `maestro-driver-ios` xcodebuild process between attempts.
  Roughly 1-in-5 frequency on iPhone 17 Pro / iOS 26.5 sim.

## `tmp-p3-smoke/`

Throwaway visual smoke flow targeting the `(dev)` gallery from
P3.1–P3.5. Will be deleted at P3.13.
