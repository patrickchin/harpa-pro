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
- [x] PG pool `statement_timeout=5s` — `packages/api/src/db/client.ts`
      (P4.2 API half; integration test in
      `__tests__/db/statement-timeout.integration.test.ts`).
- [x] Universal-link manifests served from the API origin
      (`/.well-known/apple-app-site-association` +
      `/.well-known/assetlinks.json`) — `packages/api/src/routes/well-known.ts`,
      env-driven (`IOS_APP_ID_PREFIX`, `IOS_BUNDLE_IDS`,
      `ANDROID_PACKAGE_NAMES`, `ANDROID_CERT_FINGERPRINTS_SHA256`),
      404 when unconfigured. Mobile `associatedDomains` +
      Android intent filters still pending in P4.6.

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
- [ ] Wire on API (Hono middleware) with request id + structured tags.
      Replace `apps/mobile/lib/telemetry/SentryStub.tsx` no-op.
- [ ] Wire on mobile (`@sentry/react-native`).
- [ ] Test crashes in staging confirm capture.
- [ ] Commit: `feat(api,mobile): Sentry integration with request id`.

### P4.2 Performance pass
- [ ] Mobile: `FlashList` audit (currently zero usage), `React.memo`
      audit, `useCallback`/`useMemo` on hot paths (per Pitfall 4 v3
      commit `dbaa4c1`).
- [x] API: PG `statement_timeout` (5s) on the pool in
      `packages/api/src/db/client.ts`.
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
- [x] Serve `apple-app-site-association` from the API origin
      (`packages/api/src/routes/well-known.ts`, env-driven).
- [x] Serve `assetlinks.json` from the API origin
      (`packages/api/src/routes/well-known.ts`, env-driven).
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

Two-actor (`alice` owner + `bob` editor→viewer→removed) end-to-end
journey that exercises every feature currently live on `dev`:
projects CRUD, members invite/role-change/remove + visibility checks,
reports CRUD, text notes (add + delete), generate → finalize →
unfinalize, and a new **Report Debug** surface exposing prompt +
notes + LLM response. Runs in **local-fixture mode only** against a
fresh `docker compose` stack (no API auth bypass, no test backdoors —
uses the existing `TWILIO_LIVE=0` fake-OTP path that already accepts
`000000` for any phone in dev). Dev-deployment regression coverage is
descoped (see design doc §6.2). Full design + carve-outs + testID
inventory + module breakdown:
[`design-maestro-full-regression.md`](design-maestro-full-regression.md).

Voice notes (on branch `feat/v4-voice`) and camera/photo
attachments are explicitly **carved out** for now — module slots 09
and 10a/10b are reserved with merge-triggered pickup pointers in
the design doc §7. They re-enter the journey in the same PR as
their feature merge.

- [ ] `GET /reports/{number}/debug` route + scope tests + fixture-replay test (text notes only — voice fields added with `feat/v4-voice` merge).
- [ ] `screens/report-debug.tsx` + route + dev-section actions-menu entry.
- [ ] testID audit per the design doc §3.3 inventory.
- [ ] Hidden `project-slug-chip` mounted only when `__DEV__` or `EXPO_PUBLIC_USE_FIXTURES`.
- [ ] `.maestro/helpers/` + `.maestro/modules/01, 01b, 02..08, 11..13` flows. Alice and Bob are signed up via the normal sign-up UI inside the journey; no API seed CLI needed.
- [ ] `.maestro/regression-journey.yaml` top-level runner.
- [ ] `scripts/check-maestro-testids.sh` CI grep gate.
- [ ] `.github/workflows/e2e-maestro-testid-gate.yml` runs the testID gate on every PR.
- [ ] Future-pickup commits F1–F4 land with `feat/v4-voice` + camera/photo work — tracked in design doc §7.
- [ ] Commit train per design doc §4.
