# CI/CD and migrations

> Companion: [arch-database.md](arch-database.md), [arch-ops.md](arch-ops.md),
> [pitfalls.md](pitfalls.md).
>
> **Status:** live and audited on 2026-08-04. Fly release commands, migration
> locks, readiness checks, and pre-deploy branches are implemented. The limits
> in this document are part of the operating contract.

## Why this doc exists

Before the current pipeline, production returned `200 OK` on `/healthz` while
database routes failed with `relation "app.…" does not exist`. The production
branch had no applied migrations. The old pipeline only ran `flyctl deploy`.

Two independent failures combined:

1. The old production path had no migration step.
2. `/healthz` checked process liveness, not database readiness.

The current pipeline addresses both failures. Neither control is sufficient
by itself.

---

## Decision

Fly owns production migration application. CI checks filenames and creates
recovery points. The image contains the required migration heads.

- **Apply.** The application and admin migration streams run serially inside
  the Fly release machine via `db:migrate` and `db:migrate:admin`. They use
  independent `DATABASE_URL` and `ADMIN_DATABASE_URL` secrets, ledgers, and
  advisory locks. Fly only promotes the new image if both commands exit 0.
- **Guard.** CI does not apply production migrations. It checks filename
  syntax, duplicate numeric prefixes, and the presence of both migration
  streams. It does not detect edits, renames, or deletions of applied files.
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
from admin `dev`. Production recovery branches and scheduled pruning run
independently in both Neon projects.

Hosted admin previews keep the exact-origin cookie policy. A credential-free
workflow mirrors an eligible pull request head to Git branch `pr-N`;
Cloudflare Git builds the stable `pr-N.harpa-pro-admin.pages.dev` alias against
`harpa-pro-api-pr-N.fly.dev`. The PR gate also runs the full admin browser flow
locally against two independent Testcontainers databases.

The dashboard uses the same exact head-SHA `pr-N` Pages contract. Cloudflare
connected the existing project to `patrickchin/harpa-pro` in place on
2026-08-05. Its live browser lane runs on the stable branch alias. The matching
Fly preview separately verifies GitHub's synthetic merge SHA first.

### Alternatives rejected

| Option                                       | Why rejected                                                                                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CI-only migrate before `flyctl deploy`.**  | Requires the production URL in GitHub Actions and separates the migration from the rollout. A migration can succeed before a failed deploy.                                              |
| **Release-command-only, no filename guard.** | A malformed name can change lexical order or make the image fail its readiness contract. The current guard catches names and duplicate prefixes only.                                    |
| **Drizzle-kit journal-managed migrator.**    | The current loader uses plain SQL and `app._migrations`. It has no checksum drift check.                                                                                                 |
| **Down migrations / rollback scripts.**      | Project stance is forward-only, expand-contract. Rollback is "deploy the previous image"; the previous image must remain compatible with the newer schema. See §"Expand-contract rules". |

---

## Pipeline

```
┌────────────────────────────────────────────────────────────────────────┐
│  Feature PR to dev opened or synchronized                              │
│   • App Neon pr-<n> created from app dev                               │
│   • Admin Neon pr-<n> created from admin dev                           │
│   • Fly app harpa-pro-api-pr-<n> created/deployed                      │
│       └─ release_command applies app then admin migrations             │
│       └─ /readyz and /admin/readyz verified post-deploy                │
│   • Integration tests run against pr-<n>                               │
│   • Sticky PR comment posts the preview URL                            │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                             merge to dev
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│  api-dev.yml                                                           │
│                                                                        │
│   1. Apply both migrations from GitHub Actions                         │
│   2. flyctl deploy with both migration-head build arguments            │
│      └─ Fly builds image                                               │
│      └─ Fly starts a release machine                                   │
│           └─ release_command runs db:migrate then db:migrate:admin      │
│               • each migrator acquires its own advisory lock           │
│               • each applies pending files in lexical order            │
│               • exits non-zero on first failure → Fly aborts rollout   │
│      └─ Fly rolls the image onto app and storage-worker Machines       │
│           └─ each new machine must pass GET /readyz                    │
│               • opens real DB connection                               │
│               • SELECT to_regclass('app._migrations') is non-null      │
│               • SELECT name FROM app._migrations ORDER BY name DESC    │
│                 LIMIT 1 = MIGRATIONS_REQUIRED_HEAD                     │
│               • 200 only if all checks pass                            │
│           └─ Fly halts the rollout when new Machines stay unhealthy   │
│                                                                        │
│   3. Repair and verify storage-worker topology, then arm leases         │
│   4. Verify /readyz, /admin/readyz, and post-deploy journeys            │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                     open dev-to-main promotion PR
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│  main-gate.yml                                                         │
│   • dev /healthz.gitCommit must equal the PR head SHA                  │
│   • production journeys run against that exact dev deployment         │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                             merge to main
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│  api-prod.yml                                                          │
│   1. Check migration filenames and duplicate prefixes                  │
│   2. Prune and create app and admin pre-deploy branches                │
│   3. Deploy through infra/fly/deploy.sh                                 │
│   4. Verify both readiness routes and production journeys              │
└────────────────────────────────────────────────────────────────────────┘
```

Preview and production deployments apply both streams in Fly's release
machine. Development first applies both streams from GitHub Actions. Its Fly
release command then confirms that no work remains. Production alone creates
blocking recovery branches before deployment.

The admin loader rejects a database endpoint that matches the application
endpoint. It also rejects a database that contains `app._migrations`.

---

## Workflow trigger matrix

Every workflow file in `.github/workflows/` falls into one of two
buckets — **PR-gated** (runs on `pull_request` and therefore catches
regressions before merge) or **post-merge-only** (runs on `push` to
`dev` / `main` and only fires after merge). Anything in the
post-merge-only column is a blind spot: a regression in code/scripts
exclusively exercised by those workflows ships to the target
environment and only surfaces when the deploy fires.

| Workflow                      |   PR-gated    | Push (dev / main)     | What it catches                                                                           |
| ----------------------------- | :-----------: | --------------------- | ----------------------------------------------------------------------------------------- |
| `lint-typecheck.yml`          |       ✓       | dev + main            | ESLint, TypeScript, documentation links, removal gates, CI policy tests, and shellcheck   |
| `unit.yml`                    |       ✓       | dev + main            | Vitest unit suites for every package                                                      |
| `api-integration.yml`         |       ✓       | dev + main            | Combined API unit and Testcontainers run with a hard 90% line-coverage threshold          |
| `cli.yml`                     |       ✓       | dev + main            | CLI typecheck, lint, tests, help drift, and integration journeys                          |
| `e2e-maestro-testid-gate.yml` |       ✓       | dev + main            | Maestro testID policy, Metro bundle leakage, and bounded Android launch smoke             |
| `dependency-review.yml`       |       ✓       | —                     | Reject newly introduced high or critical dependency vulnerabilities                       |
| `pr-preview.yml`              |       ✓       | (PR-only)             | Credential-free path/migration guards; human-owned Neon/Fly preview lifecycle             |
| `pages-preview-ref.yml`       |       ✓       | (PR-only)             | Tokenless exact `pr-N` Git-ref lifecycle for native Cloudflare previews                   |
| `mobile-ota-pr.yml`           |       ✓       | (PR-only)             | Human-owned same-repository PR Expo OTA preview                                           |
| `admin-preview.yml`           | ✓ (→dev/main) | (PR-only)             | Credential-free admin checks plus exact-SHA native Pages preview verification             |
| `site-preview.yml`            | ✓ (→dev/main) | (PR-only)             | Credential-free public checks plus exact-SHA native Pages preview verification            |
| `dashboard-preview.yml`       | ✓ (→dev/main) | (PR-only)             | Exact head-SHA Git preview plus fast and deployed live browser checks on the stable alias |
| `main-gate.yml`               |   ✓ (→main)   | (PR-only)             | Verifies dev serves the PR head SHA before running hard-required promotion journeys       |
| `api-dev.yml`                 |       ✗       | dev                   | `flyctl deploy` to `harpa-pro-api-dev`, `/readyz` verify, `scripts/journeys/all.sh dev`   |
| `api-prod.yml`                |       ✗       | main                  | `flyctl deploy` to `harpa-pro-api`, `/readyz` verify, `scripts/journeys/all.sh prod`      |
| `site-dev.yml`                |       ✗       | dev                   | Verify the exact SHA served by the native Pages `dev` deployment                          |
| `site-prod.yml`               |       ✗       | main                  | Verify the exact SHA on the Pages hostname and public custom domains                      |
| `admin-dev.yml`               |       ✗       | dev                   | Verify the exact SHA and static routing on the native admin `dev` deployment              |
| `admin-prod.yml`              |       ✗       | main                  | Verify the exact SHA and static routing on both admin production hostnames                |
| `dashboard-dev.yml`           |       ✗       | dev                   | Verify the exact SHA and SPA routes on the native dashboard `dev` deployment              |
| `dashboard-prod.yml`          |       ✗       | main                  | Verify the exact SHA and SPA routes on approved dashboard production hostnames            |
| `mobile-ota-dev.yml`          |       ✗       | dev                   | Preview OTA; API-dependent pushes are called by `api-dev` after deploy                    |
| `mobile-ota-prod.yml`         |       ✗       | main                  | Production OTA; API-dependent pushes are called by `api-prod` after deploy                |
| `ai-live.yml`                 |       ✓       | dev + main + dispatch | Path-filtered live AI provider smoke for same-repository PRs and pushes                   |
| `neon-snapshot-prune.yml`     |       ✗       | (cron 04:17 UTC)      | Prune stale Neon branches                                                                 |

The dashboard preview/dev/production workflows include
`packages/design-tokens/**` in their path filters. A dashboard token change
therefore rebuilds that browser surface even when `apps/dashboard` itself does
not change. Cloudflare publishes the resulting artifact from the connected
project. The public site keeps its independent visual system.

### Pull-request automation trust boundary

Dependabot controls a same-repository branch, but GitHub deliberately withholds
ordinary Actions secrets from its pull-request workflows. Same-repository
membership is therefore not sufficient authorization for a privileged job.

Credential-free verification remains available to Dependabot: lint, tests,
typechecks, local browser checks, static builds, changed-path detection, and
migration filename guards. The Pages ref workflow holds only scoped GitHub
`contents: write`, never checks out pull request code, and uses no Cloudflare
credential. Neon, Fly, EAS, cleanup, and PR-comment jobs additionally require
`github.event.pull_request.user.login != 'dependabot[bot]'`. This must use the
PR author rather than `github.actor`, because a maintainer rerun changes the
actor without transferring branch ownership.

Do not add deployment credentials to Dependabot secrets, and do not use
`pull_request_target`: checking out dependency-controlled code in a base-branch
privileged context crosses the trust boundary. Direct Dependabot security PRs
to `main` fail `main-gate` with instructions to port the coordinated update
through a human-owned `dev` PR; live journeys never receive the test-account
password on that bot path.

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

`main-gate.yml` checks out `github.event.pull_request.head.sha`, then
polls the dev API's `/healthz` with
`scripts/ci/verify-deployed-sha.sh`. The reported 40-character
`gitCommit` must equal that full PR head SHA
before any journey runs. This prevents a healthy but stale or newer
shared dev deployment from making an unrelated `main` promotion
green. Both the poll loop and the surrounding job are bounded.

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
- Always target `harpa-pro-api` through `infra/fly/fly.toml`. The script does
  not read `FLY_APP` and cannot deploy development.
- The script does not check for a dirty tree or an unpushed commit. Use the
  GitHub workflow for trusted provenance. If an owner approves a manual
  production deploy, first prove that the tree is clean and that `HEAD` equals
  `origin/main`.
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
- Run the read-only started-worker verifier again, then select the exact sole
  started worker from a fresh inventory and arm the monotonic upload-lease
  rollout through `flyctl machine exec`. Each of at most three attempts has a
  120-second provider timeout. Before a retry, another fresh inventory must
  prove the worker id has not changed; success requires the command's database
  confirmation marker. A transport failure after commit is retry-safe because
  the SQL cannot reopen the grace or turn account deletion back off. Arming
  inherits Fly's staged `DATABASE_URL`, so the production URL remains out of
  GitHub Actions and manual operator environments. Manual production deploys
  use the same deploy-to-repair-to-verify-to-arm path as CI. The GitHub deploy
  step also has a 30-minute outer timeout.

```sql
SELECT armed_at, enforce_after, account_delete_enabled, updated_at
FROM app.storage_lifecycle_rollout
WHERE singleton;
```

For production, require non-null `armed_at` and `enforce_after`. Also require
`account_delete_enabled = true`. A future `enforce_after` means the grace
period is still active.

### `.github/workflows/api-prod.yml`

- A `guard` job runs before `prod` and:
  - lints migration filenames
    (`^[0-9]+_[a-z0-9_]+(\.notx)?\.sql$` — sequential numeric prefix,
    optional `.notx` suffix for files that must run outside a tx),
  - applies the filename and duplicate-prefix checks to the admin migration
    stream,
  - prints both computed heads.
- The guard does not compare file contents or a prior manifest. Review must
  prevent edits, renames, and deletions of applied migrations.
- The `prod` job depends on `guard`. The app `DATABASE_URL` remains a staged
  Fly secret; CI resolves a direct admin-main URI through the existing Neon
  API credential and stages it only as `ADMIN_DATABASE_URL`.
- Create blocking recovery branches in both Neon projects before `flyctl deploy`.
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
  - `neon-create` — creates the app Neon branch `pr-<n>` on open/sync.
  - `admin-neon-create` — creates the isolated admin branch `pr-<n>` from
    admin `dev`. Neither create job applies migrations.
  - `fly-preview` — creates Fly app `harpa-pro-api-pr-<n>`, stages secrets
    from Doppler `dev` with both database URLs overridden to the matching
    direct PR-branch URIs,
    and `flyctl deploy`s using [`infra/fly/fly.preview.toml`](../../infra/fly/fly.preview.toml).
    Verifies both readiness endpoints and posts a sticky PR comment.
  - `fly-destroy` — destroys the Fly app on PR close.
  - `neon-destroy` and `admin-neon-destroy` — delete both branches on close,
    after `fly-destroy`.
- `guard` job: same filename checks for both migration streams (no manifest
  diff because previews are ephemeral).
- Credential-free `changes` and `guard` jobs run for Dependabot. Preview create,
  deploy, comment, and teardown jobs skip forks and Dependabot because they
  require `FLY_API_TOKEN`, `DOPPLER_TOKEN_DEV`, or `NEON_API_KEY`.
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
- Normal transactional migrations must not contain top-level transaction
  control. The loader owns `BEGIN`/`COMMIT`, rejects new files that try to
  manage their own transaction, and strips the legacy outer wrapper from the
  known historical files `0014_better_auth_init.sql`,
  `0019_account_deletion.sql`, and `0022_r2_object_lifecycle.sql` so their
  body and `app._migrations` ledger write remain atomic.
- A `*.notx.sql` file must not manage transactions either. Put any
  transactional preparation in an earlier normal migration; keep the
  non-transactional file limited to statements that cannot run in the
  loader-owned transaction and document its cleanup/retry procedure.
- Export the computed head (last filename) so a future health check or
  diagnostic can reuse it without re-globbing.

### `packages/api/src/routes/readyz.ts`

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
- `/healthz` remains database-independent and returns build identity for fast
  liveness and provenance checks.

### `packages/api/src/env.ts`

- Parse `MIGRATIONS_REQUIRED_HEAD` as `<digits>_<slug>.sql`.
- When `NODE_ENV === 'production'`, `MIGRATIONS_REQUIRED_HEAD` is required
  (Zod refinement). In dev/test it's optional and `/readyz` skips the head
  check if it's unset (so local dev doesn't have to set it).
- The parser does not accept a `.notx.sql` head. The deploy guards do accept
  that suffix. Until the code paths agree, a `.notx.sql` file must not be the
  lexically last application migration. Add a later normal migration or stop
  the release and fix the contract first.

### Tests (binding — Pitfall 13)

Under `packages/api/src/__tests__/`:

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

Use a revert through the protected branch flow when production can wait.

1. Create a revert commit from current `dev`.
2. Open a pull request to `dev`.
3. Wait for required checks and the development deployment.
4. Open the `dev` to `main` promotion pull request.
5. Make sure `main-gate` verifies the exact development SHA.
6. Merge the promotion pull request.
7. Verify `/healthz`, `/readyz`, and `/admin/readyz`.

Do not run `gh workflow run api-prod.yml --ref <sha>`. The `--ref` option
accepts a branch or tag, not a raw commit SHA. An old tag also runs the old
workflow file, which can omit current safeguards.

An emergency image rollback bypasses the protected Git flow. It requires
explicit owner approval. Select the exact prior image with
`flyctl releases --image --app harpa-pro-api`. Deploy it with the current Fly
configuration and `--skip-release-command`. Then run the current topology
repair, worker verification, lifecycle arming, and both readiness checks.
Record the image digest and resulting release ID in the incident log.

### Data rollback (bad migration or corrupting code)

The production workflow creates a recovery branch in each Neon project before
each deploy. The branch name is `snapshot-<first-12-of-sha>`. These are
compute-less Neon branches, not Neon Snapshot API objects.

The prune workflow retains at most three recovery branches per project. It
also deletes branches older than 30 days. The count limit usually removes a
branch before the age limit.

Point-in-time recovery depends on each Neon project's configured restore
window. Current plan maximums are six hours for Free, seven days for Launch,
and 30 days for Scale. New paid projects can default to one day. Verify both
projects in Neon before an incident. See [Neon pricing](https://neon.com/pricing)
and [project restore-window settings](https://neon.com/docs/manage/projects).

The application and admin projects have independent recovery timelines.
Restore only the affected project. Restore both when one deployment corrupted
both databases.

1. Stop the release process.
2. Record the bad release SHA and incident timestamp.
3. Identify the last known-good code image.
4. Identify the matching recovery branch in each affected Neon project.
5. Use point-in-time recovery if no suitable recovery branch exists.
6. Inspect the selected state on a temporary branch.
7. Check critical rows and both migration ledgers.
8. Restore the selected state to the affected `main` branch in Neon.
9. Wait for all Neon restore operations to finish.
10. Deploy the compatible code image with the emergency procedure above.
11. Verify `/healthz`, `/readyz`, and `/admin/readyz`.
12. Test one known application read and one administrator read.
13. Keep Neon's pre-restore branch until incident sign-off.
14. Record the recovered timestamp and expected data loss.

Use Neon's in-place restore option when it is available. It keeps the existing
connection string. A branch swap requires coordinated Fly and Doppler changes.
It also conflicts with workflows that resolve the branch named `main`.

This process does not restore R2 objects. Database rows can refer to objects
that a later lifecycle job already deleted. Inspect affected uploads after any
database restore.

### Scenario matrix

| Scenario                                                                  | What happens                                                                                                                                                                                               | Manual step                                                                                                                                                  |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pre-deploy recovery branch fails                                          | `api-prod.yml` exits before `flyctl deploy`. Production remains unchanged.                                                                                                                                 | Fix Neon credentials or availability. Then rerun the workflow. Do not bypass the gate.                                                                       |
| Migration syntax error in file N                                          | Release machine exits non-zero, Fly aborts the rollout. App machines keep running the previous image (still compatible with schema up to file N-1, because all prior code must tolerate the prior schema). | Author opens a follow-up PR with the corrected SQL. No DB cleanup — failed file's transaction rolled back.                                                   |
| Non-transactional file (`*.notx.sql`) fails mid-way                       | Loader has NOT recorded it in `app._migrations`. Partial side-effects (e.g. half-built index) may exist. Release machine exits non-zero, Fly aborts rollout.                                               | Manual: drop the partial object, fix the SQL, re-deploy. Documented inline in the offending file's header comment. Discouraged — prefer transactional files. |
| Migration succeeds, new code fails `/readyz` (e.g. unrelated runtime bug) | Fly halts the unhealthy rollout. The previous image must remain schema-compatible.                                                                                                                         | Inspect Machine state before any retry. Keep the forward schema and ship a fix-forward.                                                                      |
| `/readyz` reports `head-mismatch` on a running prod machine               | The image and application migration ledger do not agree.                                                                                                                                                   | Stop. Compare the image SHA, expected head, and ledger before any deploy.                                                                                    |
| Concurrent deploys race the migrator                                      | `pg_advisory_lock` serialises them; the second waits, then no-ops (all files already applied).                                                                                                             | None.                                                                                                                                                        |
| Need to revert a feature (code only)                                      | See "Code rollback" above.                                                                                                                                                                                 | None at the DB layer.                                                                                                                                        |
| Bad data shipped (corrupting migration, regression writing garbage)       | Code and each affected database need a coordinated rollback.                                                                                                                                               | Use the data rollback procedure above.                                                                                                                       |
| Recovery branch missing or older than needed                              | Recovery depends on the configured Neon restore window.                                                                                                                                                    | Verify the window. Then select an exact timestamp in Neon.                                                                                                   |
| Production lifecycle arming stalls                                        | The deployment state is unknown. Account deletion can remain disabled.                                                                                                                                     | Query `app.storage_lifecycle_rollout`. Retry only after recording its current values.                                                                        |

There are no down migrations. Migration files are append-only by convention.
The current CI guard does not enforce that convention.

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

### Applied migration files

Never edit, rename, or delete an application or admin migration after it lands
on `dev`. The ledger identifies a migration by its full filename. A rename
makes the loader treat the same SQL as new work.

The filename guard rejects duplicate numeric prefixes. It does not compare the
file set or file hashes with an earlier release.

If an applied file changes, stop the promotion. Restore the original path and
bytes from Git history. Do not patch a production migration ledger during a
normal release. Treat any existing ledger drift as a database incident.

---

## Safety properties

- **Pitfall 5 (env handling brittle)** — `MIGRATIONS_REQUIRED_HEAD` flows
  through `packages/api/src/env.ts` Zod parse with a production-only
  refinement. No `process.env.X!`.
- **Pitfall 6 (per-request scope late, untested)** — `/readyz` uses the
  default pool (admin/system role), not a scoped role; documented inline.
  The scope wrapper continues to be the only path used by user routes.
- **Pitfall 10 (defer tests/docs)** — documentation link checks run through
  `pnpm test:docs:links` and the root lint command.
- **Pitfall 13 / R5 (DI stubs become the spec)** — all readyz + migrator
  tests run against real Postgres via Testcontainers, no DB stub.

---

## Known gaps

- CI has no immutable migration manifest or checksum gate.
- The environment parser rejects a `.notx.sql` file as the required head.
- Production lifecycle arming has no command timeout or separate success
  marker.
- `infra/fly/deploy.sh` does not verify a clean, pushed checkout.
- The pipeline has no destructive-SQL approval gate.
- The repository has no automated production restore drill.
