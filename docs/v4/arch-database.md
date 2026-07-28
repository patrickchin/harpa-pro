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

- Use `pnpm --filter @harpa/api db:generate` for Drizzle schema changes.
  Policy-only and data migrations can use reviewed hand-written SQL.
- Files use `packages/api/migrations/<digits>_<slug>.sql`. The current
  sequence uses four-digit prefixes, such as
  `0023_project_write_roles.sql`. The loader also accepts older numeric
  timestamp prefixes.
- Applied via `pnpm --filter @harpa/api db:migrate`, which uses
  `drizzle-orm/node-postgres/migrator`.
- A migration MUST be paired with:
  - the matching file in `packages/api/src/db/schema/*.ts` when a
    table or column shape changes;
  - a per-request scope test in `__tests__/scope/` when a user-owned
    table or policy changes (Pitfall 6).

## IDs

Primary keys are short, prefixed, Crockford-base32 strings — the
slug IS the PK, there is no parallel UUID column. Each entity has
its own `app.<prefix>_id` Postgres DOMAIN that enforces the
`^prefix_[0-9a-hjkmnp-tv-z]{8,16}$` shape at write time:

```sql
CREATE DOMAIN app.prj_id AS text
  CHECK (VALUE ~ '^prj_[0-9a-hjkmnp-tv-z]{8,16}$');
-- …rpt_id, usr_id, ses_id, fil_id, not_id, vrf_id, wls_id, rcm_id
```

IDs are minted in the API (`packages/api/src/lib/ids.ts::newId`)
and retried on `23505`. RLS policies coerce the JWT-derived
`app.user_id` GUC into `app.usr_id` so a malformed setting fails
fast. Full design in [arch-ids-and-urls.md](arch-ids-and-urls.md)
and [design-p31-slug-only-ids.md](design-p31-slug-only-ids.md).

## Schema layout

Two schemas in the same database:

- `public` — owned by **better-auth** (migrated 2026-06; PR #124).
  Tables: `user`, `session`, `account`, `verification`. Schema is
  Drizzle-mirrored at `packages/api/src/db/auth-schema.ts` so it can be
  joined and FK'd alongside the app tables. See
  [`arch-auth-and-rls.md`](arch-auth-and-rls.md).
- `app` — everything else: projects, project_members, reports,
  notes, report_comments, files (voice / image / document / pdf), note_files,
  user_settings, waitlist_signups, llm_usage_events,
  user_limit_overrides, rate_limit_buckets, idempotency_keys. Voice and
  image assets all live in the single `files` table keyed by
  `file_kind`.

Cross-schema FK: `app.project_members.user_id REFERENCES public."user"(id)`.

Historical note: the original `auth` schema (hand-rolled users +
sessions) was replaced by better-auth's `public` tables in
migration `0014_better_auth_init.sql`. Older docs and migrations
that reference `auth.users(id)` describe the pre-migration shape.

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

Every `app.*` user-owned table has RLS enabled. The common rules are:

- `SELECT` policy gating to project membership.
- `INSERT` policy checking the current user and project role.
- `UPDATE` and `DELETE` policies checking ownership and project role.

Create the baseline policies in the migration that creates a table. If a
role contract changes later, add a forward-only policy migration. Never
edit a migration that has shipped.

### Project write roles

Migration `0023_project_write_roles.sql` adds
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

`GET /projects/{project}/reports` accepts `status=draft` or
`status=finalized`. The database applies the status predicate before
cursor pagination. An invalid status fails request validation with
`400`.

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
