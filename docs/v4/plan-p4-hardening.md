# P4 — Hardening

> Goal: production-ready API + mobile. Sentry on. Fly + Neon prod
> live. PDF byte-equivalent to mobile-old samples. Performance
> targets met.

## Exit gate (`p4-exit-gate.yml`)

- [ ] Fly prod deploy + Neon prod migrations applied successfully.
- [ ] Sentry catches crashes in both API and mobile (test crash).
- [ ] PDF byte-equivalence: rendered samples for the 3 reference
      reports under `docs/legacy-v3/pdf-samples/` match within
      tolerance (text identical, images byte-identical).
- [ ] Maestro cold-start timing < 2 s on iOS sim baseline device.
- [ ] EAS production bundle size ≤ v3 baseline (commit baseline measurement).
- [ ] All `// FIXME` and `// HACK` resolved or filed as bugs.
- [ ] Load test: API holds < 200 ms p95 at 100 RPS for 5 min.
- [ ] Backup/restore drill on Neon (PITR to a branch, verify).

## Tasks

### P4.1 Sentry
- [ ] Wire on API (Hono middleware) with request id + structured tags.
- [ ] Wire on mobile (`@sentry/react-native`).
- [ ] Test crashes in staging confirm capture.
- [ ] Commit: `feat(api,mobile): Sentry integration with request id`.

### P4.2 Performance pass
- [ ] Mobile: `FlashList` audit, `React.memo` audit, `useCallback`/`useMemo` on hot paths (per Pitfall 4 v3 commit `dbaa4c1`).
- [ ] API: enable PG statement timeout (5s), connection pool sizing.
- [ ] Cold-start measurement script in Maestro.
- [ ] Commit: `perf(mobile,api): cold-start + list virtualization + PG limits`.

### P4.3 PDF byte-equivalence
- [ ] Capture 3 reference PDFs from mobile-old (`docs/legacy-v3/pdf-samples/`).
- [ ] Rendering pipeline produces matching text + same image bytes.
- [ ] Test: `report-to-pdf.byte-equivalence.test.ts`.
- [ ] Commit: `feat(api): PDF byte-equivalent to mobile-old samples`.

### P4.4 Fly prod
- [ ] `fly.toml` for `harpa-api` (prod region, machine sizing).
- [ ] Secrets loaded.
- [ ] Health checks + auto-restart.
- [ ] Commit: `chore(infra): Fly prod config + secrets`.

### P4.5 Neon prod
- [ ] Prod project created (separate from dev).
- [ ] Migration job in deploy.
- [ ] PITR drill documented.
- [ ] Commit: `chore(infra): Neon prod + migration job`.

### P4.6 EAS production builds
- [ ] EAS project IDs finalised.
- [ ] Production profile + secrets.
- [ ] First production build green.
- [ ] Commit: `chore(mobile): EAS production profile`.

### P4.7 Load test
- [ ] `infra/loadtest/k6/*.js` scripts.
- [ ] Run against staging Fly machine.
- [ ] Commit: `test(api): k6 load test scenarios`.

### P4.8 Bugs sweep
- [ ] Triage `docs/bugs/README.md`.
- [ ] All `// FIXME` resolved or filed.
- [ ] Commit: `chore: bugs sweep + FIXME triage`.
