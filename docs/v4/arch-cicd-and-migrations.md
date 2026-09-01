# CI/CD & Migrations

> Companion: [arch-database.md](arch-database.md), [arch-ops.md](arch-ops.md),
> [pitfalls.md](pitfalls.md).
>
> **Status**: live. The Fly `release_command` migration steps, advisory-lock
> loaders, application `/readyz` check, separate `/admin/readyz` check, and
> expand-contract rules described below are all implemented. Updates land
> here when behaviour changes.

## Why this doc exists

Production was returning `200 OK` on `/healthz` while every DB-backed route
500'd with `relation "app.…" does not exist`. The Neon prod branch had never
had a migration applied. CI/CD on `main` just ran `flyctl deploy`. There was
no migration step on the prod path, and `/healthz` did not touch the DB.

Two independent failures combined:

1. **No migration step on the prod path.** `pr-preview.yml` runs
   `pnpm --filter @harpa/api db:migrate`; `api-prod.yml` does not.
2. **Liveness ≠ readiness.** `/healthz` was a static literal — it could not
   distinguish "process is up" from "process is up _and_ able to serve traffic
   against the current schema". Fly's health check was therefore green.

Both failure modes get a fix. Neither one alone is enough.

---

## Decision

**Hybrid: Fly `release_command` for the apply, CI guard for the visibility,
build-time manifest for the readiness check.**

- **Apply.** The application and admin migration streams run serially inside
  the Fly release machine via `db:migrate` and `db:migrate:admin`. They use
  independent `DATABASE_URL` and `ADMIN_DATABASE_URL` secrets, ledgers, and
  advisory locks. Fly only promotes the new image if both commands exit 0.
- **Guard.** CI does **not** apply migrations to prod itself, but it does
  refuse to deploy if the build contains new migration files whose
  pre-conditions look wrong (see "CI guard" below). This is cheap insurance
  against silently-skipped migrations.
- **Verify.** `/readyz` opens a real application DB connection and checks
  that the latest filename in `packages/api/migrations/` (captured into the
  image at build time as `MIGRATIONS_REQUIRED_HEAD`) is present in
  `app._migrations`. Fly's HTTP check is moved to `/readyz`. `/healthz`
  stays as cheap liveness (no DB) but now also returns `version` /
  `gitCommit` / `buildTime` from `GIT_COMMIT` + `BUILD_TIME` build-args.
  `GIT_COMMIT` is the full 40-character SHA
  so the mobile BuildBadge (and ops dashboards) can show which commit
  is serving traffic. CI separately checks `/admin/readyz` against
  `ADMIN_MIGRATIONS_REQUIRED_HEAD`; it is deliberately not a Fly routing
  health check, so an admin-only outage cannot remove the product API.

The admin stream lives in the independent `harpa-pro-admin` Neon project:
production uses `main`, development uses `dev`, and API previews use `pr-N`
from admin `dev`. A focused non-`dev` hotfix targeting `main` instead creates a
schema-only `pr-N` root from `main`, then migrates a new empty per-PR database;
no production rows enter the public preview. Production snapshots and
scheduled pruning run independently in both Neon projects.

Hosted PR browser admin login is intentionally disabled: Cloudflare's dynamic
Pages preview origins cannot satisfy the exact-origin cookie policy without
cross-workflow coordination. The PR gate instead runs the full admin browser
flow locally against two independent Testcontainers databases. Shared
development is the first hosted environment for browser verification.

### Alternatives rejected

| Option                                                    | Why rejected                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CI-only migrate before `flyctl deploy`.**               | Requires the prod `DATABASE_URL` in GitHub Actions secrets, broadens the blast radius for a leaked workflow token, and decouples the migration from the rollout. If migrate succeeds but deploy fails, prod is on a schema the running code doesn't expect. If deploy succeeds but a later commit forgets the CI step, we are back to today's incident. |
| **Release-command-only, no CI guard, no manifest check.** | Loses the cross-check. If a developer deletes a migration file or renames one after it's already applied to prod, `db:migrate` is silently a no-op and the symptom is the same as today. The manifest check on `/readyz` catches "code ahead of schema"; the CI guard catches "migration file renamed/removed".                                         |
| **Drizzle-kit journal-managed migrator.**                 | Our migrator is intentionally bespoke (plain SQL + `app._migrations`). Adopting Drizzle's journal is orthogonal scope — captured as an open question, not a blocker.                                                                                                                                                                                    |
| **Down migrations / rollback scripts.**                   | Project stance is forward-only, expand-contract. Rollback is "deploy the previous image"; the previous image must remain compatible with the newer schema. See §"Expand-contract rules".                                                                                                                                                                |

---

## Pipeline

```
┌────────────────────────────────────────────────────────────────────────┐
│  API-changing PR opened / synchronized                                 │
│   • App Neon pr-<n> created from app dev                               │
│   • Admin Neon pr-<n> created from admin dev                           │
│   • Fly app harpa-pro-api-pr-<n> created/deployed                      │
│       └─ release_command applies app then admin migrations             │
│       └─ /readyz and /admin/readyz verified post-deploy                │
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
│      • applies the same filename checks to admin-migrations/            │
│      • verifies the set of files is a strict superset of the previous  │
│        green main build (no rename, no delete) — uses                  │
│        actions/cache keyed on "migrations-manifest-prod"               │
│      • computes both required migration heads                          │
│      • fails build if any check fails                                  │
│                                                                        │
│   2. Blocking pre-deploy snapshots                                     │
│      • creates snapshot-<first-12-of-sha> in both Neon projects        │
│      • failure or missing Neon credentials aborts before migrations    │
│                                                                        │
│   3. flyctl deploy with both migration-head build arguments            │
│      └─ Fly builds image                                               │
│      └─ Fly starts a release machine                                   │
│           └─ release_command runs db:migrate then db:migrate:admin      │
│               • each migrator acquires its own advisory lock           │
│               • each applies pending files in lexical order            │
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
│   4. Post-deploy smoke (CI): curl $API_READY_URL (defaults to          │
│      https://harpa-pro-api.fly.dev/readyz; override via repo var)      │
│      and /admin/readyz; fail the workflow if either is not 200.         │
└────────────────────────────────────────────────────────────────────────┘
```

Backend previews, dev, and prod use the **same** migration mechanism:
Fly's `release_command` runs both migration streams inside the release
machine, against the staged `DATABASE_URL` and `ADMIN_DATABASE_URL`. The
blocking application and admin snapshots are production-only; both must
succeed before prod can enter that shared deploy path. Before applying any
admin DDL, the admin loader rejects a matching direct/pooler endpoint and
then probes the connected database for `app._migrations`. Finding the
application ledger aborts the release without creating the `admin` schema.

---

## Workflow trigger matrix

Every workflow file in `.github/workflows/` falls into one of two
buckets — **PR-gated** (runs on `pull_request` and therefore catches
regressions before merge) or **post-merge-only** (runs on `push` to
`dev` / `main` and only fires after merge). Anything in the
post-merge-only column is a blind spot: a regression in code/scripts
exclusively exercised by those workflows ships to the target
environment and only surfaces when the deploy fires.

| Workflow                      |   PR-gated    | Push (dev / main)     | What it catches                                                                                                            |
| ----------------------------- | :-----------: | --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `lint-typecheck.yml`          |       ✓       | dev + main            | ESLint, TypeScript, removal-verification gates, CI shell policy tests, shellcheck of `scripts/ci/` and `scripts/journeys/` |
| `unit.yml`                    |       ✓       | dev + main            | Vitest unit suites for every package                                                                                       |
| `api-integration.yml`         |       ✓       | dev + main            | Combined API unit + Testcontainers run with a hard 90% line-coverage threshold                                             |
| `cli.yml`                     |       ✓       | dev + main            | `apps/cli` typecheck + tests                                                                                               |
| `e2e-maestro-testid-gate.yml` |       ✓       | dev + main            | Maestro testID policy, Metro bundle leakage, and bounded Android launch smoke                                              |
| `pr-preview.yml`              |       ✓       | (PR-only)             | Per-PR Neon branch + Fly preview app + post-deploy `/readyz` verify                                                        |
| `mobile-ota-pr.yml`           |       ✓       | (PR-only)             | Per-PR Expo OTA preview                                                                                                    |
| `site-preview.yml`            | ✓ (→dev/main) | (PR-only)             | Tests + Cloudflare Pages preview for the public site                                                                       |
| `main-gate.yml`               |   ✓ (→main)   | (PR-only)             | Verifies an exact-SHA target before journeys: shared dev for `dev → main`, isolated PR preview for focused main hotfixes   |
| `api-dev.yml`                 |       ✗       | dev                   | `flyctl deploy` to `harpa-pro-api-dev`, `/readyz` verify, `scripts/journeys/all.sh dev`                                    |
| `api-prod.yml`                |       ✗       | main                  | `flyctl deploy` to `harpa-pro-api`, `/readyz` verify, `scripts/journeys/all.sh prod`                                       |
| `site-dev.yml`                |       ✗       | dev                   | Cloudflare Pages `dev` branch deploy                                                                                       |
| `site-prod.yml`               |       ✗       | main                  | Cloudflare Pages prod deploy                                                                                               |
| `mobile-ota-dev.yml`          |       ✗       | dev                   | Preview OTA; API-dependent pushes are called by `api-dev` after deploy                                                     |
| `mobile-ota-prod.yml`         |       ✗       | main                  | Production OTA; API-dependent pushes are called by `api-prod` after deploy                                                 |
| `ai-live.yml`                 |       ✗       | dev + main + dispatch | Live AI provider smoke (no fixtures)                                                                                       |
| `neon-snapshot-prune.yml`     |       ✗       | (cron 04:17 UTC)      | Prune stale Neon branches                                                                                                  |

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

### Mobile OTA release ordering

The mobile OTA workflows are both push-triggered and reusable. They inspect
the push range before publishing:

- Mobile-only changes publish from the push workflow without forcing an API
  redeploy.
- When API inputs also changed, the push workflow exits without publishing.
  The successful `api-dev` or `api-prod` job calls the corresponding reusable
  OTA workflow with the exact push SHA.
- Before every update reaches EAS, `scripts/ci/verify-api-release.sh` validates
  `/healthz.gitCommit` and requires `/readyz` to return 2xx. A deployed
  ancestor is compatible only when the complete commit range to the OTA has
  no API, contract, deployment, or lockfile changes; otherwise the deployed
  SHA must exactly match the OTA SHA.
- Every update requires an environment/version readiness tag created by the
  manual post-build job. Its annotation records `native_artifact`, and its
  commit must be an ancestor with no later native-sensitive changes.
  `pnpm-lock.yaml` and `patches/**` are treated conservatively as native
  sensitive because they can change the installed binary.
- A root app-version change means a new Expo native runtime, so the new tag
  cannot exist yet. Automated publication stops until the matching binary has
  been built and the operator confirms `native_runtime_ready` through
  `workflow_dispatch`.

GitHub caps a reusable workflow's token permissions at the calling job's
maximum. The `mobile-ota` jobs in `api-dev.yml` and `api-prod.yml` therefore
grant `contents: write` so the nested registration job can create a readiness
tag. The called workflows still default to `contents: read`; only
`register-native-runtime` elevates to write, while release-policy and OTA jobs
remain read-only.

Reusable workflows also retain the caller's event context. A manually
dispatched API workflow therefore reaches the called OTA workflow with
`github.event_name == 'workflow_dispatch'`; that does not make it a direct OTA
registration request. The called workflow uses the successful API-deploy input
to skip native registration and evaluates release policy with effective
`workflow_call` semantics. Only a direct `mobile-ota-dev` or
`mobile-ota-prod` dispatch registers a native artifact and enables the manual
OTA path.

Normal merges do not change the app version. Native changes bump it
intentionally in the reviewed change that will produce the binary. The static
contract in `scripts/ci/__tests__/mobile-ota-release-policy.test.sh` is run by
`lint-typecheck.yml`, closing the PR-gating blind spot for this release chain.
See [arch-ops.md](arch-ops.md#mobile-ota-and-native-runtime-ordering) for the
operator sequence.

### Main-promotion SHA binding

`main-gate.yml` checks out `github.event.pull_request.head.sha`, then selects
an exact-SHA journey target. A normal `dev → main` promotion polls the shared
dev API. A focused hotfix branch polls the isolated Fly + Neon deployment
created by `pr-preview.yml` for that PR. In both cases,
`scripts/ci/verify-deployed-sha.sh` requires `/healthz.gitCommit` to equal the
full 40-character PR head SHA before any journey runs. This prevents a healthy
but stale or unrelated deployment from making a production change green while
still allowing a narrow hotfix without promoting every pending `dev` commit.
The preview deploy explicitly checks out the immutable PR head instead of the
synthetic pull-request merge ref, so its image marker uses the same identity as
the gate. Before the gate sends dev journey credentials to a focused-hotfix
preview, `scripts/ci/wait-for-pr-preview.sh` queries GitHub Actions for the
matching head SHA and requires that run's `fly-preview` job to have succeeded.
A skipped, failed, missing, or unrelated preview fails closed. The provenance
wait, the SHA poll, and the surrounding job are bounded and covered by shell
self-tests in the required lint workflow. This focused path is intentionally
limited to API/admin changes that are eligible for `pr-preview`; other changes
to `main` continue through the normal `dev → main` promotion path.

---

## Concrete implementation

### `infra/fly/fly.toml`

- The release command runs `db:migrate`, then `db:migrate:admin`, then any
  environment-specific seed step. Either migration failure aborts rollout.
- Fly's routing check remains `/readyz`, scoped to the application database.
  CI checks `/admin/readyz` after deployment instead of making an admin outage
  remove the product API from service.

### `infra/fly/Dockerfile`

- Accept and expose `MIGRATIONS_REQUIRED_HEAD` and
  `ADMIN_MIGRATIONS_REQUIRED_HEAD` so each readiness endpoint knows the head
  its image expects.
- Both migration directories ship in the existing `COPY packages packages`
  layer.

### `infra/fly/deploy.sh`

- Compute `MIGRATIONS_REQUIRED_HEAD` from the sorted migration-file glob and
  pass `--build-arg MIGRATIONS_REQUIRED_HEAD=...` to `flyctl deploy`.
- Compute and pass `ADMIN_MIGRATIONS_REQUIRED_HEAD` independently.
- Compute the full `git rev-parse HEAD` value and pass it as the
  `GIT_COMMIT` build arg; abbreviated SHAs are not valid deployment identities.
- After deploy, run the shared storage-worker topology repair. It is a no-op
  only for exactly one current-release active worker plus exactly one
  current-release stopped, service-less standby watching that active Machine.
  A singleton active worker is freshly re-listed and must remain the same sole
  started/no-standby id before it gets one standby clone. A singleton stopped
  standby has its standby configuration cleared, then the same exact candidate
  must be freshly proved as the sole service-less worker without a standby.
  Repair explicitly starts it if stopped, polls at most ten fresh inventories
  three seconds apart through only safe stopped/starting states, and clones only
  after that exact id is started. An update that already started the candidate
  skips the redundant start. Both paths list Machines again and succeed only
  when the exact healthy pair is present.
- Every Machine used by repair must match one unambiguous `app` identity on
  nonempty Fly release id, release version, and valid full tagged image. The
  image comparison removes only an optional validated
  `@sha256:<64 lowercase hex>` suffix, because Fly can attach it to one
  representation of the same deployment tag; repository, tag, and release
  metadata remain exact. Tag-only Machines may coexist with at most one
  distinct explicit digest; conflicting non-null digests fail closed. Untagged,
  digest-only, malformed, stale, transitional, or ambiguous initial inventories
  fail before mutation; no process-count scaling is allowed. Each update/start
  transition also proves the candidate id, singleton topology, empty services,
  and empty standbys. If clearing succeeds but later work fails, exact singleton
  stopped/no-standby and started/no-standby states are retry-safe; all other
  drift fails closed.
- Run the read-only started-worker verifier again, then arm the monotonic
  upload-lease rollout inside that process group. Arming inherits Fly's staged
  `DATABASE_URL`, so the production URL remains out of GitHub Actions and
  manual operator environments. Manual production deploys use the same
  deploy-to-repair-to-verify-to-arm path as CI.

### `.github/workflows/api-prod.yml`

- Add a `guard` job that runs before `prod`:
  - lints migration filenames
    (`^[0-9]+_[a-z0-9_]+(\.notx)?\.sql$` — sequential numeric prefix,
    optional `.notx` suffix for files that must run outside a tx),
  - compares the file set against a cached manifest from the last green
    `main` build; fails on rename/delete of an already-shipped file,
  - applies the filename and duplicate-prefix checks to the admin migration
    stream,
  - prints both computed heads.
- The `prod` job depends on `guard`. The app `DATABASE_URL` remains a staged
  Fly secret; CI resolves a direct admin-main URI through the existing Neon
  API credential and stages it only as `ADMIN_DATABASE_URL`.
- Create blocking snapshots in both Neon projects before `flyctl deploy`.
  Either failure stops the workflow before Fly can apply a migration.
- Do not run `db:migrate` from GitHub Actions. Production migration
  ownership stays with Fly's `release_command`.
- Add a final step: `curl --fail "$API_READY_URL"` (defaults to
  `https://harpa-pro-api.fly.dev/readyz`; overridable via the
  `API_READY_URL` repo variable when a custom hostname is set up),
  with retries, and verify `/admin/readyz`, so a green workflow means both
  database contracts are live.

### `.github/workflows/pr-preview.yml`

- Lifecycle jobs keyed on PR number:
  - `neon-create` — creates the app Neon branch `pr-<n>` on open/sync from
    app `dev` for ordinary PRs.
  - `admin-neon-create` — creates the isolated admin branch `pr-<n>` from
    admin `dev`. Neither create job applies migrations.
  - `fly-preview` — creates Fly app `harpa-pro-api-pr-<n>`, stages secrets
    from Doppler `dev` with both database URLs overridden to the matching
    direct PR-branch URIs,
    and `flyctl deploy`s using [`infra/fly/fly.preview.toml`](../../infra/fly/fly.preview.toml).
    Its release command migrates both isolated databases and idempotently seeds
    the dev journey accounts before verifying both readiness endpoints and
    posting a sticky PR comment.
  - `fly-destroy` — destroys the Fly app on PR close.
  - `neon-destroy` and `admin-neon-destroy` — delete both branches on close,
    after `fly-destroy`.

Focused non-`dev` hotfixes targeting `main` are deliberately narrower. They
cannot include app/admin migrations, database code, API migration-script
wiring, Fly release commands, or the workflow/scripts that constitute the
trusted exact-SHA preview gate. Those changes must land on `dev` and use the
normal promotion path, where the data-bearing `dev` clone exercises the upgrade
against realistic nonproduction rows. PR 360 is the one-time bootstrap
exception for introducing this gate; GitHub never reuses PR numbers, so the
exception is dead after that PR merges and a later normal promotion can remove
the clause.

For an eligible hotfix, both create jobs use Neon's schema-only mode with
`main` as the schema source. Neon copies structure and roles but no rows. Each
job then creates a new empty database (`harpa_pr_N` or `harpa_admin_pr_N`) for
migrations from scratch. URI resolution is read-only and fails if the expected
branch is missing, so it cannot silently fall back to cloning a data-bearing
branch. The schema-only roots retain the same seven-day expiry and explicit
PR-close deletion as ordinary previews.

- `guard` job: same filename checks for both migration streams (no manifest
  diff because previews are ephemeral).
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
- Log `applying <file>` to stdout _before_ each `client.query(sql)`, so a
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
   as a blocking gate before `flyctl deploy`, creating
   `snapshot-<first-12-of-sha>` off the prod parent. Fly's
   `release_command` is the only production migration owner, so no
   migration can run before this snapshot succeeds. Snapshots are
   pruned after 30 days by `neon-snapshot-prune.yml`.
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

| Scenario                                                                  | What happens                                                                                                                                                                                               | Manual step                                                                                                                                                  |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pre-deploy snapshot fails                                                 | `api-prod.yml` exits before `flyctl deploy`; Fly never starts the release machine, so no migration runs and prod is unchanged.                                                                             | Fix Neon credentials or service availability, then re-run the workflow. Do not bypass the snapshot gate.                                                     |
| Migration syntax error in file N                                          | Release machine exits non-zero, Fly aborts the rollout. App machines keep running the previous image (still compatible with schema up to file N-1, because all prior code must tolerate the prior schema). | Author opens a follow-up PR with the corrected SQL. No DB cleanup — failed file's transaction rolled back.                                                   |
| Non-transactional file (`*.notx.sql`) fails mid-way                       | Loader has NOT recorded it in `app._migrations`. Partial side-effects (e.g. half-built index) may exist. Release machine exits non-zero, Fly aborts rollout.                                               | Manual: drop the partial object, fix the SQL, re-deploy. Documented inline in the offending file's header comment. Discouraged — prefer transactional files. |
| Migration succeeds, new code fails `/readyz` (e.g. unrelated runtime bug) | Fly's rolling deploy fails the new machine, auto-rollback to previous image. Previous image MUST be schema-compatible — that's the expand-contract guarantee.                                              | Investigate the runtime bug. Schema is already forward — keep it; ship a fix-forward.                                                                        |
| `/readyz` reports `head-mismatch` on a running prod machine               | Means schema was modified out-of-band (someone ran a migration manually) OR an older image is still running. Page on-call.                                                                                 | Re-deploy the current `main` SHA. If the head moved beyond `main`, audit who ran what against prod.                                                          |
| Concurrent deploys race the migrator                                      | `pg_advisory_lock` serialises them; the second waits, then no-ops (all files already applied).                                                                                                             | None.                                                                                                                                                        |
| Need to revert a feature (code only)                                      | See "Code rollback" above.                                                                                                                                                                                 | None at the DB layer.                                                                                                                                        |
| Bad data shipped (corrupting migration, regression writing garbage)       | Both code AND DB need to roll back. Use the per-deploy snapshot procedure above.                                                                                                                           | Pre-deploy snapshot is automatic; promotion is manual.                                                                                                       |
| Snapshot missing or older than needed                                     | Fall back to Neon PITR — branch at the precise timestamp from the Neon console, then follow the same promote-and-swap procedure as steps 2-5 above.                                                        | None — built into Neon's retention window.                                                                                                                   |

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
  which currently _says_ we use it but we don't. Resolve in a follow-up
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
