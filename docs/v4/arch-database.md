# Database (Neon)

> Companion: [arch-auth-and-rls.md](arch-auth-and-rls.md).

## Why Neon

- **Branching API.** Every PR gets its own DB branch (a copy-on-write
  fork of `dev`) — schema changes are tested against real data
  shapes without touching `dev` or prod.
- Free tier covers dev + PR previews.
- Standard Postgres — no proprietary SQL dialect to learn.

## Branches

| Branch | Purpose | Lifecycle |
|---|---|---|
| `prod` | Production | Long-lived. Migrations applied via Fly.io deploy. |
| `dev` | Shared dev branch (parents PR branches) | Long-lived. Migrations applied on merge to `dev` branch in git. |
| `pr-<n>` | Per-PR | Created in CI on PR open, deleted on close/merge. |
| `test-<sha>` | Local Testcontainers Postgres (NOT on Neon) | Ephemeral. Never on Neon. |

Branching is automated by `infra/neon/branch.ts`:

```bash
pnpm db:branch:create 1234   # creates pr-1234 from dev
pnpm db:branch:delete 1234   # deletes pr-1234
```

The CI workflow `pr-preview.yml` invokes both, runs migrations on
the new branch, and exposes its connection string to the preview
deploy via Fly.io secrets.

## Migrations

See [arch-cicd-and-migrations.md](arch-cicd-and-migrations.md) for the
deploy-time apply mechanism (Fly `release_command`), the `/readyz` schema-
head check, the advisory-lock-protected loader, and the expand-contract
rules. Summary below.

- Drizzle Kit generates SQL: `pnpm --filter @harpa/api db:generate`.
- Files: `packages/api/migrations/<timestamp>_<slug>.sql`. Filename
  format `YYYYMMDDHHmm_description.sql` (matches our convention).
- Applied via `pnpm --filter @harpa/api db:migrate`, which uses
  `drizzle-orm/node-postgres/migrator`.
- A migration MUST be paired with:
  - the Drizzle schema change in `packages/api/src/db/schema/*.ts`,
  - a per-request scope test in `__tests__/scope/` if the new
    table is user-owned (Pitfall 6).

## IDs

Primary keys are short, prefixed, Crockford-base32 strings — the
slug IS the PK, there is no parallel UUID column. Each entity has
its own `app.<prefix>_id` Postgres DOMAIN that enforces the
`^prefix_[0-9a-hjkmnp-tv-z]{8,16}$` shape at write time:

```sql
CREATE DOMAIN app.prj_id AS text
  CHECK (VALUE ~ '^prj_[0-9a-hjkmnp-tv-z]{8,16}$');
-- …rpt_id, usr_id, ses_id, fil_id, not_id, vrf_id, wls_id
```

IDs are minted in the API (`packages/api/src/lib/ids.ts::newId`)
and retried on `23505`. RLS policies coerce the JWT-derived
`app.user_id` GUC into `app.usr_id` so a malformed setting fails
fast. Full design in [arch-ids-and-urls.md](arch-ids-and-urls.md)
and [design-p31-slug-only-ids.md](design-p31-slug-only-ids.md).

## Schema layout

Two schemas in the same database:

- `auth` — owned by our hand-rolled auth code (users, sessions).
  Drizzle-managed schema; we did not adopt the `better-auth`
  library. See [`arch-auth-and-rls.md`](arch-auth-and-rls.md).
- `app` — everything else: projects, project_members, reports,
  notes, files (voice / image / document / pdf), user_settings,
  waitlist_signups, llm_usage_events, user_limit_overrides,
  rate_limit_buckets. Voice and image assets all live in the single
  `files` table keyed by `file_kind`.

Cross-schema FK: `app.project_members.user_id REFERENCES public."user"(id)`.

## Connection model

- Pooled connection from Neon (`pgbouncer`-fronted) for query
  workloads.
- Direct (un-pooled) connection only for migrations.
- The pool is shared; per-request scoping happens via `SET LOCAL`
  inside a transaction (see [arch-auth-and-rls.md](arch-auth-and-rls.md)).

## Roles

| Role | Used by | Permissions |
|---|---|---|
| `app_api` | Hono on Fly.io | `LOGIN`, member of `app_authenticated`, can run migrations during deploy only via a separate `app_migrator` role. |
| `app_authenticated` | Active during request handling (`SET LOCAL role`) | Table grants, but every authed table has RLS using `current_setting('app.user_id')`. |
| `app_migrator` | Used only by deploy migration step | Owner of the `app` schema. Loaded from a separate Fly secret. |

## RLS policies

Every `app.*` user-owned table has RLS enabled and at least:

- `SELECT` policy gating to project membership.
- `INSERT` policy checking `user_id = current_setting('app.user_id')`.
- `UPDATE` / `DELETE` policy checking ownership / role.

Policies live alongside the migration that creates the table — never
in a separate "policies" migration after the fact.

## Backups

Neon provides **PITR + branch-from-timestamp** out of the box on
every plan tier. We do not run our own backup pipeline.

- **Retention window**: defaults to 7 days on the Free plan, 30 days
  on Launch/Scale. Within that window, any historical state is
  recoverable by creating a Neon branch at a timestamp from the
  console or API. Confirm/raise the window for the prod project in
  the Neon dashboard → Project → Settings → History retention.
- **Per-deploy snapshots**: `api-prod.yml` calls
  `pnpm db:branch:snapshot $GITHUB_SHA` before each Fly deploy,
  creating a copy-on-write Neon branch named
  `snapshot-<first-12-of-sha>`. These survive any code-side incident
  (bad migration, corrupting writes from a regression) for 30 days,
  then `neon-snapshot-prune.yml` cron deletes them. The snapshots
  are storage-only (no compute) so cost is negligible.
- **Rollback procedure**: see
  [arch-cicd-and-migrations.md §Failure & rollback playbook](arch-cicd-and-migrations.md#failure--rollback-playbook).
- **Drill**: P4 hardening checklist requires a quarterly PITR drill
  (branch from a 1h-old timestamp, point the dev API at it, verify a
  known row). Tracked in `plan-p4-hardening.md`.
