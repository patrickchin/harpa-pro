# Databases (Neon)

> Companions: [arch-auth-and-rls.md](arch-auth-and-rls.md) and
> [design-separate-admin-auth.md](design-separate-admin-auth.md).

## Why Neon

- **Branching API.** Every API-changing PR gets copy-on-write branches from
  `dev`, so schema changes are tested against real data shapes without
  touching long-lived development or production branches.
- Copy-on-write branches keep long-lived development and short-lived previews
  inexpensive in both projects.
- Standard Postgres — no proprietary SQL dialect to learn.

## Projects

Harpa Pro uses two independent Neon projects:

| Project             | Data                                                              | API connection       |
| ------------------- | ----------------------------------------------------------------- | -------------------- |
| Application project | Better Auth, product data, and `app.activity_events`              | `DATABASE_URL`       |
| `harpa-pro-admin`   | Dedicated admin identities and sessions in database `harpa_admin` | `ADMIN_DATABASE_URL` |

The separate project is a recovery boundary, not merely a separate schema.
An application database point-in-time restore does not roll back admin
passwords or sessions, and an admin restore does not affect product data.
The API is the only component that connects to both projects. There are no
cross-database joins or foreign keys.

## Branches

| Project              | Branch       | Purpose                                                                  | Lifecycle                                                      |
| -------------------- | ------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Application          | `main`       | Production                                                               | Long-lived. Application migrations run during Fly deploy.      |
| Application          | `dev`        | Shared development parent                                                | Long-lived. Application migrations run on merge to Git `dev`.  |
| Application          | `pr-<n>`     | Per-PR application data                                                  | Created by CI for API-changing PRs and deleted on close.       |
| `harpa-pro-admin`    | `main`       | Production admin authentication                                          | Long-lived. Admin migrations run separately during Fly deploy. |
| `harpa-pro-admin`    | `dev`        | Development admin authentication                                         | Long-lived. Parent for admin-auth preview branches.            |
| `harpa-pro-admin`    | `pr-<n>`     | Per-PR admin authentication                                              | Created for API-changing previews and deleted on close.        |
| Local Testcontainers | `test-<sha>` | Application and admin integration tests use separate Postgres containers | Ephemeral. Never on Neon.                                      |

Branching is automated by `infra/neon/branch.ts`:

```bash
pnpm db:branch:create 1234   # creates pr-1234 from dev
pnpm db:branch:delete 1234   # deletes pr-1234
```

The CI workflow `pr-preview.yml` invokes the application branch tools, runs
application migrations on the new branch, and exposes its connection string
to the preview deploy through Fly secrets. API-changing previews mirror the
same branch name in `harpa-pro-admin` and supply it separately as
`ADMIN_DATABASE_URL`; frontend-only previews continue to use stable
development services.

## Migrations

See [arch-cicd-and-migrations.md](arch-cicd-and-migrations.md) for the
deploy-time apply mechanism (Fly `release_command`), the `/readyz` schema-
head check, the advisory-lock-protected loader, and the expand-contract
rules. Summary below.

- Application SQL lives under `packages/api/migrations` and is applied with
  `pnpm --filter @harpa/api db:migrate` against `DATABASE_URL`.
  Drizzle Kit generation starts with
  `pnpm --filter @harpa/api db:generate`; committed files follow the
  repository's numeric-prefix naming convention.
- Admin SQL lives under `packages/api/admin-migrations` and is applied with
  `pnpm --filter @harpa/api db:migrate:admin` against
  `ADMIN_DATABASE_URL`.
- Each stream has an independent advisory lock and migration ledger:
  `app._migrations` for application data and `admin._migrations` for admin
  authentication.
- Both streams are forward-only. Never run an admin migration through the
  application loader or edit an applied migration.
- An application migration MUST be paired with:
  - the Drizzle schema change in `packages/api/src/db/schema/*.ts`,
  - a per-request scope test in `__tests__/scope/` if the new
    table is user-owned (Pitfall 6).
- An admin migration must be paired with the isolated Drizzle mirror in
  `packages/api/src/db/admin-schema.ts` and a fresh-database integration
  test. It must not create objects in the application database.

## IDs

Primary keys are short, prefixed, Crockford-base32 strings — the
slug IS the PK, there is no parallel UUID column. Each entity has
its own `app.<prefix>_id` Postgres DOMAIN that enforces the
`^prefix_[0-9a-hjkmnp-tv-z]{8,16}$` shape at write time:

```sql
CREATE DOMAIN app.prj_id AS text
  CHECK (VALUE ~ '^prj_[0-9a-hjkmnp-tv-z]{8,16}$');
-- …rpt_id, usr_id, ses_id, fil_id, not_id, vrf_id, wls_id, rcm_id,
--   aud_id
```

IDs are minted in the API (`packages/api/src/lib/ids.ts::newId`)
and retried on `23505`. RLS policies coerce the JWT-derived
`app.user_id` GUC into `app.usr_id` so a malformed setting fails
fast. Full design in [arch-ids-and-urls.md](arch-ids-and-urls.md)
and [design-p31-slug-only-ids.md](design-p31-slug-only-ids.md).

## Schema layout

The application database contains two schemas:

- `public` — owned by **better-auth** (migrated 2026-06; PR #124).
  Tables: `user`, `session`, `account`, `verification`. Schema is
  Drizzle-mirrored at `packages/api/src/db/auth-schema.ts` so it can be
  joined and FK'd alongside the app tables. See
  [`arch-auth-and-rls.md`](arch-auth-and-rls.md).
- `app` — everything else: projects, project_members, reports,
  notes, report_comments, files (voice / image / document / pdf), note_files,
  user_settings, waitlist_signups, llm_usage_events, activity_events,
  user_limit_overrides, rate_limit_buckets, idempotency_keys. Voice and
  image assets all live in the single `files` table keyed by
  `file_kind`.

`app.activity_events` is the curated business-activity ledger for the
admin feed. Authenticated requests have insert-only access under an
actor-matching RLS policy; normal user scopes cannot read it. The admin API
reads it only after `withAdminSession()` validates a dedicated session
against the separate admin database. Its constrained registry contains
signup, project, and report milestones plus text, voice, image, and document
note details. Event level is derived in the API and is not stored. See
[design-admin-business-activity.md](design-admin-business-activity.md).

Cross-schema FK: `app.project_members.user_id REFERENCES public."user"(id)`.

Historical note: the original `auth` schema (hand-rolled users +
sessions) was replaced by better-auth's `public` tables in
migration `0014_better_auth_init.sql`. Older docs and migrations
that reference `auth.users(id)` describe the pre-migration shape.

The `harpa_admin` database in `harpa-pro-admin` contains only:

- `admin.identities` — exact, explicitly provisioned `@harpapro.com`
  identities and versioned password hashes;
- `admin.sessions` — hashed opaque session tokens, expiry, and revocation;
  and
- `admin._migrations` — the independent migration ledger.

The admin tables use `admin.adm_id` and `admin.ads_id` domains. They have no
foreign keys to application or Better Auth users. See
[design-separate-admin-auth.md](design-separate-admin-auth.md).

## Connection model

- `DATABASE_URL` feeds the application query pool, capped at ten
  connections per Fly machine. Per-request app scoping happens through
  `SET LOCAL` inside a transaction.
- `ADMIN_DATABASE_URL` is currently the direct, unpooled admin Neon URI.
  The admin migrator requires a session connection for its advisory lock;
  the runtime uses the same URI through a separate pool capped at five
  connections per Fly machine. Admin pool connection establishment and
  queued checkout both time out after five seconds, as does each statement.
- Each migration loader opens its own connection to its corresponding
  database.
- Neither pool falls back to the other URL. Env parsing in every environment
  requires a `postgres:` or `postgresql:` URI with an explicit database
  pathname and rejects URLs that identify the same Postgres host and port,
  including Neon's direct and `-pooler` forms.
- The admin migrator and `admin:set-password` repeat that check before
  loading the application runtime. After connecting, but before any admin
  DDL or credential write, they also refuse a database that contains
  `app._migrations`. Deployment automation separately resolves the URLs from
  different Neon project IDs; that remains the restore-boundary guarantee.

## PostgreSQL errors through Drizzle

Drizzle ORM wraps node-postgres query failures in `DrizzleQueryError`; the
driver error containing the PostgreSQL SQLSTATE and server message is exposed
through its `cause` chain. Route and service error mapping must use
`packages/api/src/lib/pg-error.ts::getPgError` rather than reading `code` or
`message` directly from the caught value. Real-Postgres integration tests pin
the last-owner `23514` response and the account-deletion rollout `55000`
response so dependency upgrades cannot silently turn them into HTTP 500s.

## Roles

| Role                | Used by                                           | Permissions                                                                                                       |
| ------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `app_api`           | Hono on Fly.io                                    | `LOGIN`, member of `app_authenticated`, can run migrations during deploy only via a separate `app_migrator` role. |
| `app_authenticated` | Active during request handling (`SET LOCAL role`) | Table grants, but every authed table has RLS using `current_setting('app.user_id')`.                              |
| `app_migrator`      | Used only by deploy migration step                | Owner of the `app` schema. Loaded from a separate Fly secret.                                                     |

The `harpa-pro-admin` project uses its own database owner credential. Normal
application database roles do not exist there. The `admin` schema and its
tables revoke `PUBLIC` access and enable RLS without policies, so any
non-owner role introduced later starts with no row access. The current
dedicated owner credential is restricted operationally to the admin pool and
migrator.

## RLS policies

Every `app.*` user-owned table has RLS enabled and at least:

- `SELECT` policy gating to project membership.
- `INSERT` policy checking `user_id = current_setting('app.user_id')`.
- `UPDATE` / `DELETE` policy checking ownership / role.

Policies live alongside the migration that creates the table — never
in a separate "policies" migration after the fact.

## Backups

Neon provides **PITR + branch-from-timestamp** independently for each
project. We do not run our own backup pipeline.

- **Retention window**: defaults to 7 days on the Free plan, 30 days
  on Launch/Scale. Within that window, any historical state is
  recoverable by creating a Neon branch at a timestamp from the
  console or API. Confirm/raise the window for the prod project in
  each Neon dashboard → Project → Settings → History retention. Configure
  the application and admin projects independently.
- **Per-deploy snapshots**: `api-prod.yml` snapshots both projects'
  `main` branches before each Fly deploy, creating matching copy-on-write
  branches named `snapshot-<first-12-of-sha>`. This keeps independent
  rollback targets for application and admin migrations. The 30-day snapshot
  pruning policy applies to both projects.
- **Rollback procedure**: see
  [arch-cicd-and-migrations.md §Failure & rollback playbook](arch-cicd-and-migrations.md#failure--rollback-playbook).
- **Admin isolation**: restoring or branching the application project does
  not alter `harpa-pro-admin`. Restore admin identities or sessions only from
  the admin project. A second database or schema inside the application
  project would not provide this independent recovery boundary.
- **Drill**: P4 hardening requires quarterly PITR drills in both projects.
  Branch each project from a one-hour-old timestamp, point the corresponding
  dev connection at it, and verify a known row without crossing the restore
  boundaries. Tracked in `plan-p4-hardening.md`.
