# CI/CD & Migrations

> Companion: [arch-database.md](arch-database.md), [arch-ops.md](arch-ops.md),
> [pitfalls.md](pitfalls.md).
>
> **Status**: live. The Fly `release_command` migration step, advisory-lock
> loader, `/readyz` schema-head check, and expand-contract rules described
> below are all implemented. Updates land here when behaviour changes.

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
  stays as cheap liveness (no DB) but now also returns `version` /
  `gitCommit` / `buildTime` from `GIT_COMMIT` + `BUILD_TIME` build-args.
  `GIT_COMMIT` is the full 40-character SHA
  so the mobile BuildBadge (and ops dashboards) can show which commit
  is serving traffic.

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
│  API-changing PR opened / synchronized                                 │
│   • Neon branch pr-<n> created (delete-and-recreate from main)         │
│   • Fly app harpa-pro-api-pr-<n> created/deployed                      │
│       └─ release_command: pnpm --filter @harpa/api db:migrate          │
│           applies pending migrations to pr-<n>                         │
│       └─ /readyz verified post-deploy                                  │
│   • Integration tests run against pr-<n>                               │
│   • Sticky PR comment posts the preview URL                            │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                            merge to main
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│  api-prod.yml                                                          │
│                                                                        │
│   1. CI guard job                                                      │
│      • verifies every file in packages/api/migrations/ matches         │
│        ^[0-9]+_[a-z0-9_]+(\.notx)?\.sql$ (sequential numeric prefix)   │
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
│   3. Post-deploy smoke (CI): curl $API_READY_URL (defaults to          │
│      https://harpa-pro-api.fly.dev/readyz; override via repo var)      │
│      from the runner, fail the workflow if it's not 200.               │
└────────────────────────────────────────────────────────────────────────┘
```

Backend previews and prod use the **same** mechanism for steps 2 + 3 — Fly's
`release_command` runs migrations inside the release machine, against
whatever `DATABASE_URL` is staged on the app. The only difference is
which Fly app and which Neon branch is targeted.

---

## Workflow trigger matrix

Every workflow file in `.github/workflows/` falls into one of two
buckets — **PR-gated** (runs on `pull_request` and therefore catches
regressions before merge) or **post-merge-only** (runs on `push` to
`dev` / `main` and only fires after merge). Anything in the
post-merge-only column is a blind spot: a regression in code/scripts
exclusively exercised by those workflows ships to the target
environment and only surfaces when the deploy fires.

| Workflow                          | PR-gated | Push (dev / main)     | What it catches |
| --------------------------------- | :------: | --------------------- | ----------------------------------------------------------------- |
| `lint-typecheck.yml`              | ✓        | dev + main            | ESLint, TypeScript, removal-verification gates, CI shell self-tests, shellcheck of `scripts/ci/` and `scripts/journeys/` |
| `unit.yml`                        | ✓        | dev + main            | Vitest unit suites for every package |
| `api-integration.yml`             | ✓        | dev + main            | Combined API unit + Testcontainers run with a hard 90% line-coverage threshold |
| `cli.yml`                         | ✓        | dev + main            | `apps/cli` typecheck + tests |
| `e2e-maestro-testid-gate.yml`     | ✓        | dev + main            | Maestro testID policy, Metro bundle leakage, and bounded Android launch smoke |
| `pr-preview.yml`                  | ✓        | (PR-only)             | Per-PR Neon branch + Fly preview app + post-deploy `/readyz` verify |
| `mobile-ota-pr.yml`               | ✓        | (PR-only)             | Per-PR Expo OTA preview |
| `site-preview.yml`                | ✓ (→dev/main)| (PR-only)          | Tests + Cloudflare Pages preview for the public site |
| `main-gate.yml`                   | ✓ (→main)| (PR-only)             | Verifies dev serves the PR head SHA before running hard-required promotion journeys |
| `api-dev.yml`                     | ✗        | dev                   | `flyctl deploy` to `harpa-pro-api-dev`, `/readyz` verify, `scripts/journeys/all.sh dev` |
| `api-prod.yml`                    | ✗        | main                  | `flyctl deploy` to `harpa-pro-api`, `/readyz` verify, `scripts/journeys/all.sh prod` |
| `site-dev.yml`                    | ✗        | dev                   | Cloudflare Pages `dev` branch deploy |
| `site-prod.yml`                   | ✗        | main                  | Cloudflare Pages prod deploy |
| `mobile-ota-dev.yml`              | ✗        | dev                   | Expo OTA publish to dev channel |
| `mobile-ota-prod.yml`             | ✗        | main                  | Expo OTA publish to prod channel |
| `version-bump-dev.yml`            | ✗        | dev                   | Auto version bump after merge |
| `ai-live.yml`                     | ✗        | dev + main + dispatch | Live AI provider smoke (no fixtures) |
| `neon-snapshot-prune.yml`         | ✗        | (cron 04:17 UTC)      | Prune stale Neon branches |

### Closing post-merge blind spots

When a workflow lives only in the post-merge column, the rule is:

1. **Extract the glue into a script** (`scripts/ci/*.sh`,
   `scripts/journeys/*.sh`) so it can be exercised independently.
2. **Add a self-test** (`scripts/ci/__tests__/*.test.sh` or a Vitest
   integration test) that runs the script against a fake or
   container-bound dependency.
3. **Wire the self-test into a PR-gated job** — usually
   `lint-typecheck.yml` for shell glue, `api-integration.yml` for
   API contract checks, or a workflow with `pull_request:` trigger.
4. **Run `shellcheck`** on every directory of shell helpers so
   syntactic drift fails the PR.

The `Verify /readyz (dev)` cold-start regression
([docs/bugs/2026-06-06-api-dev-readyz-cold-start.md](../bugs/2026-06-06-api-dev-readyz-cold-start.md))
is the canonical example of this blind spot. The fix established
the pattern above: `scripts/ci/verify-readyz.sh` with a python-based
fake-server self-test wired into `lint-typecheck.yml`, plus
shellcheck of both `scripts/ci/` and `scripts/journeys/`.

### Main-promotion SHA binding

`main-gate.yml` checks out `github.event.pull_request.head.sha`, then
polls the dev API's `/healthz` with
`scripts/ci/verify-deployed-sha.sh`. The reported 40-character
`gitCommit` must equal that full PR head SHA
before any journey runs. This prevents a healthy but stale or newer
shared dev deployment from making an unrelated `main` promotion
green. Both the poll loop and the surrounding job are bounded.

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
- Compute the full `git rev-parse HEAD` value and pass it as the
  `GIT_COMMIT` build arg; abbreviated SHAs are not valid deployment identities.

### `.github/workflows/api-prod.yml`

- Add a `guard` job that runs before `prod`:
  - lints migration filenames
    (`^[0-9]+_[a-z0-9_]+(\.notx)?\.sql$` — sequential numeric prefix,
    optional `.notx` suffix for files that must run outside a tx),
  - compares the file set against a cached manifest from the last green
    `main` build; fails on rename/delete of an already-shipped file,
  - prints the computed head.
- The `prod` job depends on `guard`. No `DATABASE_URL` secret added to CI.
- Add a final step: `curl --fail "$API_READY_URL"` (defaults to
  `https://harpa-pro-api.fly.dev/readyz`; overridable via the
  `API_READY_URL` repo variable when a custom hostname is set up),
  with retries, so a green workflow means a live healthy prod.

### `.github/workflows/pr-preview.yml`

- Lifecycle jobs keyed on PR number:
  - `neon-create` — creates Neon branch `pr-<n>` on open/sync. Does **not**
    apply migrations (that's `release_command`'s job).
  - `fly-preview` — creates Fly app `harpa-pro-api-pr-<n>`, stages secrets
    from Doppler `dev` with `DATABASE_URL` overridden to the PR's Neon URI,
    and `flyctl deploy`s using [`infra/fly/fly.preview.toml`](../../infra/fly/fly.preview.toml).
    Verifies `/readyz` and posts a sticky PR comment with the URL.
  - `fly-destroy` — destroys the Fly app on PR close.
  - `neon-destroy` — deletes the Neon branch on close, after `fly-destroy`,
    so the release_command on a now-deleted DB doesn't error during teardown.
- `guard` job: same migration filename lint as prod (no manifest diff —
  preview is ephemeral). Catching format errors at PR time is cheaper than
  at prod.
- Forks are skipped (no `FLY_API_TOKEN` / `DOPPLER_TOKEN_DEV` /
  `NEON_API_KEY` available to fork PRs).
- Path filter: `neon-create`, `fly-preview`, and `guard` run only for PRs
  that change API inputs (`packages/api`, `packages/api-contract`,
  `packages/ai-fixtures`, lockfile, or TS config). Frontend-only PRs use
  the shared dev API from mobile OTA bundles instead of creating a
  Fly/Neon preview.

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

### Code rollback (no data change)

Most regressions are code-only — the schema is forward-compatible
(expand-contract) and the previous image already tolerates the
current schema. Roll back by re-deploying the previous SHA:

```bash
# Find the previous successful deploy
fly releases -a harpa-pro-api | head -10
# Roll back (Fly will re-pull and re-promote the prior image)
fly deploy --image registry.fly.io/harpa-pro-api:deployment-<old> -a harpa-pro-api
# OR redeploy a prior commit from CI:
gh workflow run api-prod.yml --ref <old-sha>
```

The post-deploy `/readyz` curl proves the rollback served traffic.
No DB touch required.

### Data rollback (bad migration or corrupting code)

If a deploy lands a destructive migration, or a regression writes
bad data, **redeploying the previous image is not enough** — the DB
state needs to come back too. We have two layered safety nets,
both via Neon's copy-on-write branching:

1. **Per-deploy snapshot** (preferred — bounded, named).
   `api-prod.yml` calls `pnpm db:branch:snapshot $GITHUB_SHA`
   before every deploy, creating `snapshot-<first-12-of-sha>` off
   the prod parent. Pruned after 30 days by
   `neon-snapshot-prune.yml`.
2. **Point-in-time recovery** (fallback — any timestamp in retention).
   Neon retains a continuous history (7 days on Free, 30 on
   Launch/Scale). Use this when the bad state predates the most
   recent snapshot or you need finer-grained timing.

**Procedure** (~5 min wall time, assuming snapshot exists):

```bash
# 1. Identify the snapshot to restore from (Neon console → Branches,
#    OR `curl https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches`).
SNAP=snapshot-abc123def456

# 2. Promote it to a temporary endpoint and capture the URI
#    (Neon console → snapshot branch → "Add compute" → copy URI).
NEW_URL='postgres://...neon.tech/neondb'

# 3. Point prod at the new URL. Use --stage so the activation is
#    atomic when we flip in step 4. The new URL must use the
#    -pooler hostname (see arch-ops.md §Scaling).
fly secrets set DATABASE_URL="$NEW_URL" --stage -a harpa-pro-api
doppler secrets set DATABASE_URL="$NEW_URL" --project harpa-pro --config prd

# 4. Roll the previous (compatible) image with the new DATABASE_URL.
#    Both env + image must change together.
fly deploy --image registry.fly.io/harpa-pro-api:deployment-<good> -a harpa-pro-api

# 5. Verify via /readyz + a known-good DB-backed route.
curl -fsS https://harpa-pro-api.fly.dev/readyz

# 6. Once stable, in Neon console: promote the temp branch to the
#    new prod parent (or rename it), retire the corrupted parent.
```

**Why not just `pg_restore`?** Neon's branching is faster (seconds,
not minutes) and avoids the temptation to run a long-running
restore against a live compute. Branch-and-swap is the native idiom.

### Scenario matrix

| Scenario | What happens | Manual step |
|---|---|---|
| Migration syntax error in file N | Release machine exits non-zero, Fly aborts the rollout. App machines keep running the previous image (still compatible with schema up to file N-1, because all prior code must tolerate the prior schema). | Author opens a follow-up PR with the corrected SQL. No DB cleanup — failed file's transaction rolled back. |
| Non-transactional file (`*.notx.sql`) fails mid-way | Loader has NOT recorded it in `app._migrations`. Partial side-effects (e.g. half-built index) may exist. Release machine exits non-zero, Fly aborts rollout. | Manual: drop the partial object, fix the SQL, re-deploy. Documented inline in the offending file's header comment. Discouraged — prefer transactional files. |
| Migration succeeds, new code fails `/readyz` (e.g. unrelated runtime bug) | Fly's rolling deploy fails the new machine, auto-rollback to previous image. Previous image MUST be schema-compatible — that's the expand-contract guarantee. | Investigate the runtime bug. Schema is already forward — keep it; ship a fix-forward. |
| `/readyz` reports `head-mismatch` on a running prod machine | Means schema was modified out-of-band (someone ran a migration manually) OR an older image is still running. Page on-call. | Re-deploy the current `main` SHA. If the head moved beyond `main`, audit who ran what against prod. |
| Concurrent deploys race the migrator | `pg_advisory_lock` serialises them; the second waits, then no-ops (all files already applied). | None. |
| Need to revert a feature (code only) | See "Code rollback" above. | None at the DB layer. |
| Bad data shipped (corrupting migration, regression writing garbage) | Both code AND DB need to roll back. Use the per-deploy snapshot procedure above. | Pre-deploy snapshot is automatic; promotion is manual. |
| Snapshot missing or older than needed | Fall back to Neon PITR — branch at the precise timestamp from the Neon console, then follow the same promote-and-swap procedure as steps 2-5 above. | None — built into Neon's retention window. |

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

### Renumbering an applied migration

If a migration file was already applied to a long-lived Neon branch
(e.g. dev) and then renamed in a later commit — typically to break a
duplicate numeric prefix collision — the migrator on that branch will
see the new filename as an unapplied file and re-run it. There is no
built-in way to rename a row in `app._migrations`.

Recovery procedure (run against the affected branch only — never prod
unless prod also applied the file under its old name):

1. Make the SQL idempotent. Add `IF NOT EXISTS` to the `ADD COLUMN` /
   `CREATE INDEX` / `CREATE TABLE` so a re-run is a harmless no-op.
   This is the safety net if step 2 is skipped — the migrator will
   succeed and `INSERT` the new row, leaving a duplicate "applied"
   entry but no schema damage.
2. Patch `app._migrations` out-of-band via `psql`:

   ```sql
   BEGIN;
   DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM app._migrations WHERE name = '<old>.sql') THEN
       RAISE EXCEPTION 'old row missing — wrong DB?';
     END IF;
     IF EXISTS (SELECT 1 FROM app._migrations WHERE name = '<new>.sql') THEN
       RAISE EXCEPTION 'new row already present — already patched?';
     END IF;
   END$$;
   UPDATE app._migrations
      SET name = '<new>.sql'
    WHERE name = '<old>.sql';
   COMMIT;
   ```

3. Re-run the deploy. The migrator finds `<new>.sql` already recorded
   and treats it as applied.

The `Lint migration filenames` CI guard rejects duplicate numeric
prefixes at PR time, so this should be rare. It exists for the case
where the duplicate slipped through earlier.

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
- **Preview Fly machines.** Implemented — see `pr-preview.yml` jobs
  `fly-preview` / `fly-destroy` and [`infra/fly/fly.preview.toml`](../../infra/fly/fly.preview.toml).
  Migration application now lives exclusively in `release_command` (preview,
  dev, and prod all use the same mechanism). Open follow-ups: cron sweep
  for orphan preview apps if a `closed` webhook is missed; automated
  mobile preview builds pinned to the PR's API URL.
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
