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

The flow uses fake OTP `000000` (via `TWILIO_VERIFY_FAKE_CODE` in
fixture mode). The seeded invite target (`+15550100200`, Bob Editor)
is reseeded by `reset-db.sh` so the invite step always finds a real
user. The flow deletes the project at the end.

## `regression-journey.yaml` (overnight full-coverage journey)

Orchestrator flow that runs every regression module in
`.maestro/modules/` sequentially against a single signed-up alice
(no `reset-db.sh` needed — it signs up alice + bob fresh, then
deletes the project + signs out at the end). Covers:

1. Auth (sign-up alice + sign-out + sign-in)
2. Sign-up bob
3. Projects CRUD
4. Members invite / permissions / viewer / remove
5. Reports CRUD
6. Text notes (add/delete)
7. Voice notes — fixture recorder, transcript card
8. Photo notes (draft) — camera → upload → image note
9. Generate + finalize
10. Report debug
11. Projects delete
12. Account view + edit-cancel + edit-save
13. Usage screen render
14. Profile identity + nav
15. Sign out

**Pre-condition:** docker compose stack up, Metro running, app built
with `EXPO_PUBLIC_USE_FIXTURES=true` (so fixture recorder + fixture
camera work), microphone + camera privacy grants on the sim.

**Run:**

```bash
docker compose down -v && docker compose up -d   # fresh DB
maestro test .maestro/regression-journey.yaml
```

Modules 09 (voice) and 10a (photo) depend on the fixture-mode build.
Modules 14/15/16 navigate to Profile / Account / Usage screens.

## `p3-15-upload.yaml` (legacy — superseded by module 10a)

Same photo pipeline as `modules/10a-photo-notes-draft.yaml` but
signs in as seeded `+15550100100` (requires `reset-db.sh`).
Kept for one-off iteration on the camera path; safe to delete once
module 10a is green on CI.

## `p3-15-voice-record.yaml` (legacy — superseded by module 09)

Same voice pipeline as `modules/09-voice-notes.yaml` but signs in as
seeded `+15550100100`. Kept for one-off iteration; safe to delete
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
