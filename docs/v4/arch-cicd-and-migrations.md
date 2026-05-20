# CI/CD & Migrations

> Companion: [arch-database.md](arch-database.md), [arch-ops.md](arch-ops.md),
> [pitfalls.md](pitfalls.md).
>
> **Status**: design. Implementation lives in a follow-up PR — this doc is the
> contract that PR must match.

## Why this doc exists

Production was returning `200 OK` on `/healthz` while every DB-backed route
500'd with `relation "app.…" does not exist`. The Neon prod branch had never
had a migration applied. CI/CD on `main` just ran `flyctl deploy`. There was
no migration step on the prod path, and `/healthz` did not touch the DB.

Two independent failures combined:

1. **No migration step on the prod path.** `pr-preview.yml` runs
   `pnpm --filter @harpa/api db:migrate`; `api-prod.yml` does not.
2. **Liveness ≠ readiness.** `/healthz` was a static literal — it could not
   distinguish "process is up" from "process is up *and* able to serve traffic
   against the current schema". Fly's health check was therefore green.

Both failure modes get a fix. Neither one alone is enough.

---

## Decision

**Hybrid: Fly `release_command` for the apply, CI guard for the visibility,
build-time manifest for the readiness check.**

- **Apply.** Migrations run inside the Fly release machine via
  `release_command = "pnpm --filter @harpa/api db:migrate"` (same image, same
  `DATABASE_URL` secret, same code that PR previews use). Fly only promotes
  the new image to app machines if the release machine exits 0.
- **Guard.** CI does **not** apply migrations to prod itself, but it does
  refuse to deploy if the build contains new migration files whose
  pre-conditions look wrong (see "CI guard" below). This is cheap insurance
  against silently-skipped migrations.
- **Verify.** A new `/readyz` route opens a real DB connection and checks
  that the latest filename in `packages/api/migrations/` (captured into the
  image at build time as `MIGRATIONS_REQUIRED_HEAD`) is present in
  `app._migrations`. Fly's HTTP check is moved to `/readyz`. `/healthz`
  stays as cheap liveness (no DB).

### Alternatives rejected

| Option | Why rejected |
|---|---|
| **CI-only migrate before `flyctl deploy`.** | Requires the prod `DATABASE_URL` in GitHub Actions secrets, broadens the blast radius for a leaked workflow token, and decouples the migration from the rollout. If migrate succeeds but deploy fails, prod is on a schema the running code doesn't expect. If deploy succeeds but a later commit forgets the CI step, we are back to today's incident. |
| **Release-command-only, no CI guard, no manifest check.** | Loses the cross-check. If a developer deletes a migration file or renames one after it's already applied to prod, `db:migrate` is silently a no-op and the symptom is the same as today. The manifest check on `/readyz` catches "code ahead of schema"; the CI guard catches "migration file renamed/removed". |
| **Drizzle-kit journal-managed migrator.** | Our migrator is intentionally bespoke (plain SQL + `app._migrations`). Adopting Drizzle's journal is orthogonal scope — captured as an open question, not a blocker. |
| **Down migrations / rollback scripts.** | Project stance is forward-only, expand-contract. Rollback is "deploy the previous image"; the previous image must remain compatible with the newer schema. See §"Expand-contract rules". |

---

## Pipeline

```
┌────────────────────────────────────────────────────────────────────────┐
│  PR opened / synchronized                                              │
│   • Neon branch pr-<n> created (or refreshed)                          │
│   • pnpm --filter @harpa/api db:migrate  ← run in CI (preview path)    │
│   • Integration tests run against pr-<n>                               │
│   • (future) Fly preview machine deployed with DATABASE_URL=pr-<n>     │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                            merge to main
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│  api-prod.yml                                                          │
│                                                                        │
│   1. CI guard job                                                      │
│      • verifies every file in packages/api/migrations/ matches         │
│        YYYYMMDDHHmm_*.sql                                              │
│      • verifies the set of files is a strict superset of the previous  │
│        green main build (no rename, no delete) — uses                  │
│        actions/cache keyed on "migrations-manifest-prod"               │
│      • computes MIGRATIONS_REQUIRED_HEAD = last filename               │
│      • fails build if any check fails                                  │
│                                                                        │
│   2. flyctl deploy --build-arg MIGRATIONS_REQUIRED_HEAD=<head>         │
│      └─ Fly builds image                                               │
│      └─ Fly starts a release machine                                   │
│           └─ release_command: pnpm --filter @harpa/api db:migrate      │
│               • acquires pg_advisory_lock(MIGRATION_LOCK_KEY)          │
│               • applies pending files in lexical order                 │
│               • prints "applying <file>" before each query             │
│               • exits non-zero on first failure → Fly aborts rollout   │
│      └─ Fly rolls new image onto app machines one at a time            │
│           └─ each new machine must pass GET /readyz                    │
│               • opens real DB connection                               │
│               • SELECT to_regclass('app._migrations') is non-null      │
│               • SELECT name FROM app._migrations ORDER BY applied_at   │
│                 DESC LIMIT 1 = MIGRATIONS_REQUIRED_HEAD                │
│               • 200 only if all checks pass                            │
│           └─ Fly auto-rollback if /readyz fails grace period           │
│                                                                        │
│   3. Post-deploy smoke (CI): curl https://api.harpapro.com/readyz      │
│      from the runner, fail the workflow if it's not 200.               │
└────────────────────────────────────────────────────────────────────────┘
```

Preview and prod use the **same** mechanism for steps 2 + 3. The only
difference is which Fly app and which Neon branch is targeted (preview keeps
its CI-side `db:migrate` because the preview Fly machine doesn't exist yet —
see "Open questions").

---

## Concrete file changes

> No code in this doc — just paths + intent. The implementation PR writes
> the code and tests.

### `infra/fly/fly.toml`

- Add `[deploy] release_command = "pnpm --filter @harpa/api db:migrate"`.
- Change `[[http_service.checks]] path` from `/healthz` to `/readyz`.
- Tighten `grace_period` (release machine has already run; new machines
  should be ready quickly) — concrete value left to the implementation PR.
- Add a second cheaper liveness check on `/healthz` if Fly's check vocabulary
  supports two — otherwise `/readyz` is the only HTTP check.

### `infra/fly/Dockerfile`

- Accept `ARG MIGRATIONS_REQUIRED_HEAD` and `ENV MIGRATIONS_REQUIRED_HEAD=$MIGRATIONS_REQUIRED_HEAD`
  so the running container knows what head it expects.
- No need to ship a separate migration entrypoint — the `db:migrate` script
  already exists at the workspace level and the image has the full repo.
- Confirm `packages/api/migrations/**/*.sql` is in the COPY layer (it is —
  `COPY packages packages`).

### `infra/fly/deploy.sh`

- Compute `MIGRATIONS_REQUIRED_HEAD` from `ls packages/api/migrations | sort | tail -1`
  and pass `--build-arg MIGRATIONS_REQUIRED_HEAD=...` to `flyctl deploy`.

### `.github/workflows/api-prod.yml`

- Add a `guard` job that runs before `prod`:
  - lints migration filenames (`^[0-9]{12}_[a-z0-9_]+\.sql$`),
  - compares the file set against a cached manifest from the last green
    `main` build; fails on rename/delete of an already-shipped file,
  - prints the computed head.
- The `prod` job depends on `guard`. No `DATABASE_URL` secret added to CI.
- Add a final step: `curl --fail https://api.harpapro.com/readyz` (URL via
  workflow env), with retries, so a green workflow means a live healthy prod.

### `.github/workflows/pr-preview.yml`

- Keep the CI-side `db:migrate` against the PR branch (no Fly app yet).
- Add the same `guard` job (filename check, no manifest diff — preview is
  ephemeral). Catching format errors at PR time is cheaper than at prod.
- Document that once preview machines exist, the `db:migrate` step moves to
  the preview Fly app's release_command and CI's job becomes a smoke curl.

### `packages/api/src/db/migrate.ts`

- Wrap the apply loop in `pg_advisory_lock(<constant key>)` /
  `pg_advisory_unlock`. Key is a fixed bigint (documented inline).
- Log `applying <file>` to stdout *before* each `client.query(sql)`, so a
  hang or crash names the offender. Log `applied <file> in <ms>ms` after.
- On error, log the file name + first SQL line of the failing statement and
  exit non-zero. Do not swallow.
- Wrap each file in `BEGIN`/`COMMIT`. Files that contain non-transactional
  statements (e.g. `CREATE INDEX CONCURRENTLY`) must be named
  `*.notx.sql` and the loader runs them outside a transaction. Documented
  in §"Failure & rollback".
- Export the computed head (last filename) so a future health check or
  diagnostic can reuse it without re-globbing.

### `packages/api/src/routes/readyz.ts` (new)

- `GET /readyz` opens a connection (via the existing pool), runs:
  - `SELECT 1` — basic DB reachability.
  - `SELECT to_regclass('app._migrations') IS NOT NULL` — schema bootstrap.
  - `SELECT name FROM app._migrations ORDER BY name DESC LIMIT 1` and
    compare to `env.MIGRATIONS_REQUIRED_HEAD`.
- Response shape (typed via `@hono/zod-openapi` like `health.ts`):
  - `200 { ok: true, db: 'up', head: <name> }` — all checks pass.
  - `503 { ok: false, db: 'down' | 'schema-missing' | 'head-mismatch', expected, actual }`
    on any failure. 503 (not 500) so Fly/LBs treat it as "not ready" rather
    than a bug.
- Caches the "green" result for ~2s to avoid hammering the pool on Fly's
  30s interval × N machines. Errors are never cached.
- `/healthz` stays as the static literal — Fly's liveness path if we keep
  one, and a fast curl target for humans.

### `packages/api/src/env.ts`

- Add `MIGRATIONS_REQUIRED_HEAD: z.string().regex(/^[0-9]{12}_[a-z0-9_]+\.sql$/).optional()`.
- When `NODE_ENV === 'production'`, `MIGRATIONS_REQUIRED_HEAD` is required
  (Zod refinement). In dev/test it's optional and `/readyz` skips the head
  check if it's unset (so local dev doesn't have to set it).

### Tests (binding — Pitfall 13)

Under `packages/api/src/__tests__/integration/`:

- `readyz.integration.test.ts` — boots the API against a fresh
  Testcontainers Postgres (no manual migration) and asserts:
  1. `GET /readyz` returns **503 `schema-missing`** before any migration.
  2. After `migrate(connectionString)`, `GET /readyz` returns **200** with
     `head` = last filename.
  3. With `MIGRATIONS_REQUIRED_HEAD` set to a non-existent name, `GET /readyz`
     returns **503 `head-mismatch`** with `expected`/`actual` populated.
  4. With DB unreachable (close the container), `GET /readyz` returns
     **503 `db: 'down'`** within the 5s timeout.
- `migrate.advisory-lock.integration.test.ts` — two concurrent
  `migrate(url)` calls against the same Testcontainers DB; assert no
  duplicate `app._migrations` rows, no SQL error, both return clean.
- `migrate.failing-file.integration.test.ts` — point the migrator at a
  fixture dir whose third file is invalid SQL; assert process exits non-zero,
  stderr names the failing file, `app._migrations` has rows 1 and 2 only.
- No DI stub for the DB client in any of the above. They exercise the real
  `pg` driver against a real Postgres (Pitfall 13 / R5).

---

## Failure & rollback playbook

| Scenario | What happens | Manual step |
|---|---|---|
| Migration syntax error in file N | Release machine exits non-zero, Fly aborts the rollout. App machines keep running the previous image (still compatible with schema up to file N-1, because all prior code must tolerate the prior schema). | Author opens a follow-up PR with the corrected SQL. No DB cleanup — failed file's transaction rolled back. |
| Non-transactional file (`*.notx.sql`) fails mid-way | Loader has NOT recorded it in `app._migrations`. Partial side-effects (e.g. half-built index) may exist. Release machine exits non-zero, Fly aborts rollout. | Manual: drop the partial object, fix the SQL, re-deploy. Documented inline in the offending file's header comment. Discouraged — prefer transactional files. |
| Migration succeeds, new code fails `/readyz` (e.g. unrelated runtime bug) | Fly's rolling deploy fails the new machine, auto-rollback to previous image. Previous image MUST be schema-compatible — that's the expand-contract guarantee. | Investigate the runtime bug. Schema is already forward — keep it; ship a fix-forward. |
| `/readyz` reports `head-mismatch` on a running prod machine | Means schema was modified out-of-band (someone ran a migration manually) OR an older image is still running. Page on-call. | Re-deploy the current `main` SHA. If the head moved beyond `main`, audit who ran what against prod. |
| Concurrent deploys race the migrator | `pg_advisory_lock` serialises them; the second waits, then no-ops (all files already applied). | None. |
| Need to revert a feature | Deploy the previous image SHA. The previous image's code must already cope with the new schema (expand-contract; see below). No `down` migration is written or run. | None at the DB layer. |

**No `down` migrations.** Confirmed by `arch-database.md` (forward-only,
files in `migrations/` are append-only). This doc upgrades that from
"convention" to "the rollback strategy depends on it".

---

## Expand-contract rules (author checklist)

For any schema change, in this order, across **separate PRs**:

1. **Expand.** Add the new column / table / index. New code may write to it
   but **must not require it** for reads. Old code keeps working.
2. **Backfill.** Ship code that populates the new shape. Reads still tolerate
   absence (dual-read).
3. **Switch.** Flip reads to the new shape. Old code path is still present
   but inert.
4. **Contract.** Drop the old column / index. Only after at least one
   release has run cleanly with reads off the new shape.

Renames are split into add-new + dual-write + switch-read + drop-old. Never
a single `ALTER TABLE … RENAME`.

The CI guard's "manifest superset" check enforces that an already-shipped
migration cannot be renamed or deleted — it can only be superseded by a
later file.

Reference incident: today's prod 500s. Even with the new pipeline, an
author who ships a `DROP COLUMN` in the same PR that introduces the new
column will cause a brief window where the old running machine 500s. The
expand-contract rule prevents that. Pipeline cannot.

---

## Pitfalls addressed

- **Pitfall 5 (env handling brittle)** — `MIGRATIONS_REQUIRED_HEAD` flows
  through `packages/api/src/env.ts` Zod parse with a production-only
  refinement. No `process.env.X!`.
- **Pitfall 6 (per-request scope late, untested)** — `/readyz` uses the
  default pool (admin/system role), not a scoped role; documented inline.
  The scope wrapper continues to be the only path used by user routes.
- **Pitfall 10 (defer tests/docs)** — this doc lands with the
  implementation PR; the test list above is binding.
- **Pitfall 13 / R5 (DI stubs become the spec)** — all readyz + migrator
  tests run against real Postgres via Testcontainers, no DB stub.

---

## Implementation checklist (one item ≈ one commit)

1. `feat(api): /readyz route with DB + schema-head check` — adds
   `routes/readyz.ts`, wires into `app.ts`, adds `MIGRATIONS_REQUIRED_HEAD`
   to `env.ts`, adds `readyz.integration.test.ts`.
2. `feat(api): advisory lock + per-file logging in migrator` — updates
   `db/migrate.ts`, adds `migrate.advisory-lock.integration.test.ts` and
   `migrate.failing-file.integration.test.ts`.
3. `chore(fly): release_command runs db:migrate; health check on /readyz` —
   updates `infra/fly/fly.toml`, `infra/fly/Dockerfile`
   (`ARG MIGRATIONS_REQUIRED_HEAD`), `infra/fly/deploy.sh` (compute +
   pass build arg).
4. `ci(api-prod): guard job + post-deploy /readyz smoke` — updates
   `.github/workflows/api-prod.yml`, adds the manifest-cache step.
5. `ci(pr-preview): align with prod guard + filename lint` — updates
   `.github/workflows/pr-preview.yml`.
6. `docs(bugs): log prod migration-skip incident under R-new` — adds an
   entry to `docs/bugs/README.md` referencing this design.

Each commit ships its own test + doc updates per Pitfall 10. The
implementation PR cites this doc in its description and links the new
recurring-bug entry.

---

## Open questions / carve-outs

- **Drizzle-kit journal.** Should we replace the bespoke loader with
  `drizzle-orm/node-postgres/migrator`? It would give us a checksum-based
  drift check for free. Out of scope for this doc — see `arch-database.md`,
  which currently *says* we use it but we don't. Resolve in a follow-up
  ADR; either adopt drizzle-kit or fix the doc.
- **Preview Fly machines.** Today PR previews only get a Neon branch, no
  Fly app. Once preview Fly machines exist, the CI `db:migrate` step moves
  into their `release_command` and `pr-preview.yml` matches `api-prod.yml`
  exactly. Tracked alongside the M-series preview-deploy work.
- **Destructive-migration approval gate.** Should `DROP TABLE` /
  `DROP COLUMN` require a manual GitHub Environment approval before
  `flyctl deploy`? Probably yes, but needs product sign-off on the friction.
  Recommend: CI guard greps for `DROP TABLE|DROP COLUMN|TRUNCATE` in new
  migration files and labels the PR `migration:destructive`; the
  `production` GitHub Environment requires reviewer approval for any deploy
  carrying that label. Carved out for a follow-up.
- **Liveness vs readiness on Fly.** If Fly's HTTP check supports only one
  endpoint, we pick `/readyz` (this design assumes that). If it supports
  separate liveness + readiness, route `/healthz` to liveness and `/readyz`
  to readiness. Confirm with `flyctl` docs at implementation time.
- **`app._migrations` ordering.** We currently order by `name` (lexical
  filename). Confirm that no historical filename violates the
  `YYYYMMDDHHmm_*` convention before flipping the head check to "max(name)".
  All six current files do.
