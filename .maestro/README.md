# Maestro flows

End-to-end mobile flows run via [Maestro](https://maestro.mobile.dev/).

## `p3-action-buttons.yaml`

Covers every action button shipped through P3.8 against the **real**
`(auth)` + `(app)` routes (not the `(dev)` gallery).

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

## `tmp-p3-smoke/`

Throwaway visual smoke flow targeting the `(dev)` gallery from
P3.1–P3.5. Will be deleted at P3.13.
