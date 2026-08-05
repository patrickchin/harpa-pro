# Databases (Neon)

> Companions: [arch-auth-and-rls.md](arch-auth-and-rls.md) and
> [design-separate-admin-auth.md](design-separate-admin-auth.md).

## Why Neon

- The repository uses Neon's branch API for long-lived and preview branches.
- The database is standard PostgreSQL.
- Application and admin data use separate Neon projects.

These points describe the repository design. The active Neon plan, branch
inventory, restore window, and billing state are provider state. Treat them
as **UNKNOWN** until the Neon API or console verifies them.

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

Repository automation for branches lives in `infra/neon/branch.ts`:

```bash
pnpm db:branch:create 1234   # creates pr-1234 from dev
pnpm db:branch:delete 1234   # deletes pr-1234
```

The CI workflow `pr-preview.yml` invokes the application branch tools and
runs migrations on the new branch. API-changing previews also create an
admin branch with the same name. Frontend-only previews use stable
development services.

The workflow is evidence of intended automation. It does not prove that a
specific provider branch currently exists.

## Migrations

See [arch-cicd-and-migrations.md](arch-cicd-and-migrations.md) for the
deploy-time apply mechanism (Fly `release_command`), the `/readyz` schema-
head check, the advisory-lock-protected loader, and the expand-contract
rules. Summary below.

- Application SQL lives under `packages/api/migrations` and is applied with
  `pnpm --filter @harpa/api db:migrate` against `DATABASE_URL`.
  `packages/api/src/db/migrate.ts` is a bespoke SQL runner. It does not use
  Drizzle's migration runner. Drizzle Kit generation starts with
  `pnpm --filter @harpa/api db:generate`, but generated SQL is only a candidate:
  authors must review and commit the repository migration file. Policy-only
  and data migrations can use reviewed hand-written SQL. Committed files use
  `<digits>_<slug>.sql`. The current sequence uses four-digit prefixes, such as
  `0028_report_version_monotonic.sql`, while the loader also accepts older
  numeric timestamp prefixes.
- Admin SQL lives under `packages/api/admin-migrations` and is applied with
  `pnpm --filter @harpa/api db:migrate:admin` against
  `ADMIN_DATABASE_URL`.
- Each stream has an independent advisory lock and migration ledger:
  `app._migrations` for application data and `admin._migrations` for admin
  authentication.
- The application runner applies each normal file in its own transaction.
  It rejects new top-level transaction control. A `.notx.sql` file runs
  without the wrapper and requires its own documented recovery plan.
- The runner accepts `.notx.sql`, but `MIGRATIONS_REQUIRED_HEAD` currently
  rejects that filename shape. A `.notx.sql` file cannot be the deployable
  required head until readiness parsing is fixed. This is an unresolved gap.
- Both streams are forward-only. Never run an admin migration through the
  application loader or edit an applied migration.
- The repository does not have an immutable migration manifest or applied-file
  checksum gate. The ledger stores filenames only. Review and branch
  protection must prevent edits to an applied file.
- An application migration MUST be paired with:
  - the Drizzle schema change in `packages/api/src/db/schema.ts`,
  - a per-request scope test in `__tests__/scope/` when a user-owned table or
    policy changes (Pitfall 6).
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
  user_limit_overrides, rate_limit_buckets, idempotency_keys,
  file_upload_leases, storage_delete_jobs, and storage_lifecycle_rollout.
  Voice and image assets live in the single `files` table keyed by
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
  connections per API machine. Per-request app scoping happens through
  `SET LOCAL` inside a transaction.
- `ADMIN_DATABASE_URL` is currently the direct, unpooled admin Neon URI.
  The admin migrator requires a session connection for its advisory lock;
  the runtime uses the same URI through a separate pool capped at five
  connections per Fly machine. Admin pool connection establishment and
  queued checkout both time out after five seconds, as does each statement.
- Each migration loader opens its own session connection to its corresponding
  database.
- Fly release migrations and the application runtime currently use the same
  `DATABASE_URL` credential. There is no separate application migrator
  secret.
- Admin release migrations and the admin runtime currently use the same
  `ADMIN_DATABASE_URL` owner credential.
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

| Role                                | Current use                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| Connection user from `DATABASE_URL` | Owns or can alter the application schema. It serves runtime queries and release migrations. |
| `app_authenticated`                 | `SET LOCAL ROLE` target for authenticated requests. RLS reads `app.user_id`.                |
| `app_anonymous`                     | `SET LOCAL ROLE` target for public waitlist writes.                                         |

Migration `0001_init.sql` grants `app_authenticated` and `app_anonymous` to
`CURRENT_USER`. The repository does not create `app_api` or `app_migrator`.
Credential separation remains planned, not implemented.

The admin database uses its own owner credential. Normal application roles do
not exist there. The `admin` schema revokes `PUBLIC` access. Its sensitive
tables enable RLS without policies, so a future non-owner role starts without
row access.

The API uses the admin owner credential for both runtime and migration work.
That owner can bypass RLS. The separate Neon project is the current recovery
boundary. It is not least-privilege credential separation.

## RLS policies

Every `app.*` user-owned table has RLS enabled. The common rules are:

- Project content usually gates reads to project membership and checks the
  current user's role for writes.
- Personal rows usually check `current_setting('app.user_id')`.
- The activity ledger has an insert-only actor policy for normal user scope.

Policies live in the migration stream. Create baseline policies with the table.
If a role contract changes later, add a forward-only policy migration. Never
edit a shipped migration. Schema changes must update the Drizzle mirror and
matching scope tests.

### Project write roles

Migration `0027_project_write_roles.sql` adds
`app.can_edit_project(project_id)`. The helper checks the current
`app.user_id` and returns true for owners and editors.

The migration keeps project content readable by all members and narrows
writes:

- owners and editors can update project metadata;
- owners and editors can create, update, and delete reports;
- owners and editors can create notes;
- a note author can update or delete the note while they remain a writer;
- owners and editors can change project-scoped files;
- viewers remain read-only, except for the narrow PDF export path.

Project deletion and membership changes remain owner-only. A current
member can render a PDF. The `app.attach_report_pdf` security-definer
function validates the exact report and generated file before it changes
only `reports.pdf_file_id`.

### Report concurrency and filtering

Report body and state mutations accept an optional
`expectedUpdatedAt` ISO timestamp during the mobile compatibility
window. Dashboard and updated mobile clients send the `updatedAt` value
they read. The SQL `UPDATE` includes that timestamp in its predicate.
A stale write changes no row, and the API returns `409` with the current
report.

The precondition applies to report `PATCH`, generate, regenerate,
finalize, and unfinalize. The generate path checks it before the AI call
and again in the final `UPDATE`, so an edit during generation cannot be
overwritten. Attachment placement keeps its existing
`expectedBodyVersion` precondition.

The API serializes `updated_at` at millisecond precision, so every report-row
writer must advance that value by at least one millisecond. Report service
writes use the later of the millisecond-truncated database clock and the
stored value plus one millisecond. Attachment placement uses that shared
expression. Migration `0028_report_version_monotonic.sql` replaces
`app.attach_report_pdf()` so PDF registration follows the same rule.

The monotonic rule also handles a database clock behind the stored value. An
integration test sets a future version before each write and requires the
returned value to be later. See the
[recurring-bug entry](../bugs/2026-08-05-report-version-millisecond-collision.md).

`GET /projects/{project}/reports` accepts `status=draft` or
`status=finalized`. The database applies the status predicate before
cursor pagination. An invalid status fails request validation with
`400`.

## Backups

Neon restore history and repository snapshots are different controls.

Current Neon plan ceilings are documented on
[Neon pricing](https://neon.com/pricing):

- Free: up to six hours, also limited by changed-data volume.
- Launch: configurable up to seven days.
- Scale: configurable up to 30 days.

Paid projects can default to a shorter window. Verify the configured window
for the application and admin projects separately. Current provider settings
are **UNKNOWN** from this repository.

The production workflow also creates copy-on-write branches before a deploy:

- `.github/workflows/api-prod.yml` snapshots both projects before Fly runs
  release migrations.
- Snapshot names use `snapshot-<first-12-of-sha>`.
- The workflow prunes to two snapshots before it creates the new third one.
- `.github/workflows/neon-snapshot-prune.yml` retains at most three snapshots
  per project and removes snapshots older than 30 days.

The 30-day value is a maximum age, not a promise of 30 days of snapshots.
Frequent deployments still retain only the newest three.

Workflow configuration does not prove that the latest snapshot job
succeeded. Verify the GitHub run and both Neon branch lists before a risky
deployment or restore.

Restoring the application project does not restore the admin project. Restore
each project only from its matching history or snapshot. See the
[`arch-cicd-and-migrations.md` rollback playbook](arch-cicd-and-migrations.md#failure--rollback-playbook)
for the operator procedure.

The repository describes quarterly restore drills but contains no current
provider evidence that a drill succeeded. Treat drill status as **UNKNOWN**.
