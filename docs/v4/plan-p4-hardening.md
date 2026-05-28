# P4 — Hardening

> Goal: production-ready API + mobile. Sentry on. Neon prod
> migration job + PITR drill. PDF export pipeline working
> end-to-end. Performance targets met. Universal links live.
>
> **Scope discipline:** P4 is hardening only — Sentry, perf,
> prod-infra finishing, PDF export pipeline, load test, universal
> links, bugs sweep. Pure feature completion that runs locally
> belongs in [P3.15](plan-p3-feature-build.md#p315--feature-completion--upload-wiring).
>
> **Backend-first ordering:** the prod migration job (P4.4 below)
> is being pulled forward and shipped together with P3.15's API
> work — see the
> [P3.15 Backend-first track](plan-p3-feature-build.md#p315--feature-completion--upload-wiring).
> Other P4 items stay here.

## Already shipped (audited 2026-05-19)

- [x] Fly prod config + deploy workflow — `infra/fly/fly.toml`,
      `.github/workflows/api-prod.yml`.
- [x] EAS production profile — `apps/mobile/eas.json`.
- [x] iOS prebuild for `expo-camera` — `apps/mobile/ios/` checked in.

## Exit gate (`p4-exit-gate.yml`)

- [ ] Sentry catches crashes in both API and mobile (test crash).
- [ ] PDF export works end-to-end on mobile (`expo-print` +
      `expo-sharing`) and renders inline in `PdfPreviewModal`.
      Visual parity with mobile-old samples reviewed manually
      (no byte-equivalence requirement).
- [ ] Maestro cold-start timing < 2 s on iOS sim baseline device.
- [ ] EAS production bundle size ≤ v3 baseline (commit baseline measurement).
- [ ] All `// FIXME` and `// HACK` resolved or filed as bugs.
- [ ] Load test: API holds < 200 ms p95 at 100 RPS for 5 min.
- [ ] Backup/restore drill on Neon (PITR to a branch, verify).
- [ ] Universal links: cold tap on `/p/:projectSlug` and
      `/r/:reportSlug` resolves via the auth gate.

## Tasks

### P4.1 Sentry
- [x] Wire on API (Hono middleware) with request id + structured tags.
      Replace `apps/mobile/lib/telemetry/SentryStub.tsx` no-op.
- [x] Wire on mobile (`@sentry/react-native`).
- [ ] Test crashes in staging confirm capture.
- [x] Commit: `feat(api,mobile): Sentry integration with request id`.

Code wiring note (2026-05-28): API + mobile implementation is ready
behind unset DSNs. The remaining P4.1 acceptance step is CLI secret
provisioning plus staging test-crash confirmation.

### P4.2 Performance pass
- [ ] Mobile: `FlashList` audit (currently zero usage), `React.memo`
      audit, `useCallback`/`useMemo` on hot paths (per Pitfall 4 v3
      commit `dbaa4c1`).
- [ ] API: PG `statement_timeout` (5s) on the pool in
      `packages/api/src/db/client.ts` — currently only `max: 10`
      is set.
- [ ] Cold-start measurement Maestro flow (`.maestro/cold-start.yaml`).
- [ ] Commit: `perf(mobile,api): cold-start + list virtualization + PG limits`.

### P4.3 PDF export pipeline
- [ ] Mobile PDF export: replace the stub
      `apps/mobile/lib/export-report-pdf.ts` (currently throws
      "Saving PDFs lands in P4 …") with real `expo-print` +
      `expo-sharing` wiring. `saveReportPdf`, `exportReportPdf`,
      `shareSavedReportPdf`, `openSavedReportPdf` all work against
      a real finalized report.
- [ ] Inline PDF rendering on mobile (`react-native-webview` or
      `react-native-pdf`) for `PdfPreviewModal` — currently ships
      modal chrome only.
- [ ] Visual review pass against mobile-old samples (manual diff —
      headings, layout, image placement). No byte-equivalence test.
- [ ] Vitest: export pipeline round-trips without throwing on a
      populated finalized report fixture.
- [ ] Commit: `feat(mobile): PDF export + inline preview wired`.

### P4.4 Neon prod migration + PITR
- [ ] Add the `pnpm --filter @harpa/api db:migrate` step to
      `.github/workflows/api-prod.yml` (currently only in dev
      workflow at lines 63–66).
- [ ] Document the PITR drill (branch from prod → verify → drop).
- [ ] Commit: `chore(infra): Neon prod migration job + PITR drill`.

### P4.5 Load test
- [ ] Create `infra/loadtest/k6/*.js` scripts (directory does not exist).
- [ ] Run against staging Fly machine.
- [ ] Commit: `test(api): k6 load test scenarios`.

### P4.6 Universal links
- [ ] Serve `apple-app-site-association` from the API origin.
- [ ] Serve `assetlinks.json` from the API origin.
- [ ] `app.config.ts` `associatedDomains` + Android `intentFilters` wired
      (currently only the `expo-camera` plugin is configured).
- [ ] `/p/:projectSlug` and `/r/:reportSlug` resolve from a cold
      tap on a share link — Maestro flow `share-link-cold-start.yaml`.
- [ ] Push-notification → deep-link routing (notif payload carries
      canonical URL; tap handler `router.push`es it through the
      auth gate's deferred-intent stash from P2.6).
- [ ] Commit: `feat(mobile,api): universal links + push deep-link routing`.

### P4.7 Bugs sweep
- [ ] Triage `docs/bugs/README.md`.
- [ ] All `// FIXME` resolved or filed.
- [ ] Commit: `chore: bugs sweep + FIXME triage`.

### P4.8 Maestro full regression journey

**Status:** green on real Android device `R3CT7092S2H`
(`com.harpa.pro.dev`, fixture-replay mode) as of HEAD `11632dc`
(2026-05-24). Full journey wallclock ~18m21s across modules 01-auth,
01b-signup-bob, 02-projects-crud, 03-members-invite,
04-members-permissions, 05-members-viewer, 06-members-remove,
07-reports-crud, 08-text-notes, 11-generate-finalize,
12-report-debug, 13-projects-delete (plus helpers + sign-out).
Windows-host gotchas catalogued in
[`pitfalls-maestro-windows.md`](pitfalls-maestro-windows.md).

Two-actor (`alice` owner + `bob` editor→viewer→removed) end-to-end
journey that exercises every feature currently live on `dev`:
projects CRUD, members invite/role-change/remove + visibility checks,
reports CRUD, text notes (add + delete), generate → finalize →
unfinalize, and a new **Report Debug** surface exposing prompt +
notes + LLM response. Runs first in **local-fixture mode** against a
fresh `docker compose` stack using the existing `TWILIO_LIVE=0`
fake-OTP path, then against the **dev deployment** using the gated
test-account password bypass and non-destructive per-run cleanup.
Full design + carve-outs + testID inventory + module breakdown:
[`design-maestro-full-regression.md`](design-maestro-full-regression.md).

Voice notes and camera/photo attachments used to be future pickup
slots. Module 09 now covers the voice lifecycle, and module 10a now
covers the landed draft-side photo upload redesign.

**2026-05-28 goal reset.** Photo upload is the active E2E target after
the `5173049` redesign landed on `dev`. Module 10a covers attachment
selection → camera capture → two-photo batch upload → per-tile UI →
generated Report-tab photo strip → preview modal → photo-note delete
→ draft cleanup.
Module 10b now covers the remaining photo path: a photo-bearing report
is finalized, the saved-report `ReportPhotos` block renders, the image
preview opens by fileId, and the finalized report is deleted before
the journey continues. Focused local Android passed 01/02/10b, the
full local regression passed with 10b included, and the clean full
dev-deployment regression passed against `harpa-pro-api-dev`
(`gitCommit=9db5b51`, project `DevE2E-20260528T204311`, deleted
in-flow).

**2026-05-28 local result.** Focused Android run passed
`01-auth.yaml`, `02-projects-crud.yaml`, and expanded
`10a-photo-notes-draft.yaml` against the local docker-compose stack.
The full local regression journey then passed with modules 01, 01b,
02, 03, 04, 05, 06, 07, 08, 09, 10a, 11, 12, 13, 14, 15, 16, and
final sign-out. A focused follow-up run also passed 01/02/11/12/13.
Local Android setup needs `adb reverse tcp:9000 tcp:9000` as well as
Metro/API reverses because photo signed upload URLs target local
MinIO.

**2026-05-28 dev result.** Dev deployment coverage now uses a local
CLI auth broker plus API/R2 proxies so the device can exercise the
real dev Fly/Neon/R2 stack without exposing the shared test-account
password to Maestro logs. After replacing module 10a's final
local-only project-name assertion with project-home recovery that also
understands the dynamic dev project name, a clean full dev run of
`regression-journey-dev.yaml` passed modules 01, 01b, 02, 03, 04, 05,
06, 07, 08, 09, 10a, 11, 12, 13, 14, 15, 16, and final sign-out.
R2 PUT/GET traffic for voice and photos was observed through
`scripts/dev-e2e-r2-proxy.cjs`.

**Shipped:**

- [x] `GET /reports/{number}/debug` route + scope tests + fixture-replay test (text notes only; voice fields are tracked after module 09 is stable).
- [x] `screens/report-debug.tsx` + route + dev-section actions-menu entry.
- [x] testID audit per the design doc §3.3 inventory.
- [x] Project row selectors in modules 04–06, 13 use the post-edit name (`text: "Regression Test Project \(Edited\)"`); an earlier `project-slug-chip` approach was dropped because Android a11y filters hidden elements.
- [x] `.maestro/helpers/` + `.maestro/modules/01, 01b, 02..08, 11..13` flows. Alice and Bob are signed up via the normal sign-up UI inside the journey; no API seed CLI needed.
- [x] `.maestro/regression-journey.yaml` top-level runner (lives at repo root `.maestro/`, not under `apps/mobile/`).
- [x] Module 09 (`09-voice-notes.yaml`) re-enabled and expanded for fixture recording, upload, transcript, summary, playback entry point, and delete.
- [x] Module 10a (`10a-photo-notes-draft.yaml`) re-enabled and expanded for the photo upload redesign lifecycle.
- [x] Module 10b (`10b-photo-notes-finalized.yaml`) added for finalized saved-report photo strip + preview coverage.

**Remaining:**

- [ ] `scripts/check-maestro-testids.sh` CI grep gate.
- [ ] `.github/workflows/e2e-maestro-testid-gate.yml` runs the testID gate on every PR.
- [ ] CI workflow that actually runs the journey (currently developer-driven on the real device — no CI matrix yet for the Android emulator leg).
- [x] Dev-deployment E2E pass after local green: same coverage against `harpa-pro-api-dev` using the `POST /auth/password/verify` test-account bypass, dev Neon/R2, and non-destructive per-run cleanup.
- [ ] `mo journey` / Maestro target support for `local` vs `dev`, with strict ordering so dev runs only after local passes. This should provide the password-login helper/setup hook for dev.
- [ ] Remaining uncovered surfaces outside the passing journey: voice-specific debug fields, avatar upload, and deep-link/push flows.
- [ ] Remaining future-pickup modules (12a voice debug fields, avatar upload) land alongside their feature work — tracked in design doc §7.
- [ ] Commit train per design doc §4 (initial bring-up commits landed; outstanding ones folded into the bullets above).
