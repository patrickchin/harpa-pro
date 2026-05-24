# 2026-05-20 — prod returned 200 on /healthz while every DB route 500'd (Pattern R7)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Fly machine `harpa-pro-api` v11 was `started`, 1/1
health checks passing, image deployed cleanly. But every endpoint
that touched the DB returned `500 { code: "internal_error" }`.
Postgres logs showed `42P01 relation "app.waitlist_signups" does
not exist` for `POST /waitlist`, `relation "auth.verifications"
does not exist` for `POST /auth/otp/start`, etc.

**Root cause.** Two independent failures:
1. The Neon prod branch had never had a migration applied.
   `api-prod.yml` only ran `flyctl deploy`; there was no
   migration step on the prod path. (`pr-preview.yml` runs
   `pnpm db:migrate` against the ephemeral PR Neon branch; that
   workflow is the *only* place migrations had ever run before
   this incident.)
2. `/healthz` was a static literal — `c.json({ok:true,...})` with
   no DB query — so Fly's HTTP check was green regardless of
   whether the DB schema was usable.

**Fix.** `docs/v4/arch-cicd-and-migrations.md` design + the
follow-up implementation:
- Fly `release_command` runs `pnpm --filter @harpa/api db:migrate`
  in a release machine; Fly only promotes the new image to app
  machines if it exits 0.
- New `/readyz` opens a real DB connection AND compares
  `app._migrations` head to a build-time
  `MIGRATIONS_REQUIRED_HEAD`. Fly's HTTP check now targets
  `/readyz`. `/healthz` stays as liveness.
- Migrator hardened: `pg_advisory_lock` serialises concurrent
  runs, per-file `BEGIN/COMMIT`, fail-loud logging.
- New `guard` job in `api-prod.yml` lints migration filenames at
  PR time; post-deploy step curls `/readyz` so a green workflow
  proves real traffic was served.

**Test.** Three Testcontainers integration tests under
`packages/api/src/__tests__/`:
- `readyz.integration.test.ts` — 503 schema-missing before
  migrate; 200 after; 503 head-mismatch with a bad
  `MIGRATIONS_REQUIRED_HEAD`; 503 db-down when pool is gone.
- `migrate.advisory-lock.integration.test.ts` — two concurrent
  `migrate()` calls produce exactly one set of `app._migrations`
  rows with no duplicate-key error.
- `migrate.failing-file.integration.test.ts` — a fixture dir with
  a bad SQL in file #3 rolls back the file's tx, leaves files
  #1+#2 committed, and stops the loop before file #4.

**Pattern.** R7 — Health check is a static literal, not a
readiness probe (added to README).

---
