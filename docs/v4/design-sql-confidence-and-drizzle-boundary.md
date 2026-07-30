# Design — SQL confidence and Drizzle boundary

Status: first slice implemented.

## Problem

The API already has the right high-level contract: every authenticated query
runs through a scoped Drizzle handle, and PostgreSQL enforces access control
through `SET LOCAL` role/session state plus RLS. The problem is lower-level
confidence.

- At branch point `537d1b0f`, the `dev` snapshot contained 90 authored
  SQL-through-Drizzle `.execute` call sites outside tests. Some were ordinary
  CRUD that Drizzle's builder could express more clearly; others are
  intentionally PostgreSQL-native.
- `app.note_files` is a live table in migration `0010_note_files.sql` and in
  runtime queries, but it has no Drizzle model in `db/schema.ts`.
- Deploy-critical SQL in `scripts/seed-test-account.ts` is exercised only on
  deploy paths today. The 2026-06-06 dev failure showed that this class of
  drift is real.
- Migration CI proves "fresh database reaches head" via Testcontainers, but
  that is not the same as proving that data-moving backfills behave correctly
  against representative legacy rows.

The goal is not "remove SQL." The goal is to make the easy paths typed and to
make the hard paths provably safe.

## Decision

Adopt this boundary:

- Drizzle builder is the default for ordinary row CRUD and simple scoped reads.
- Raw SQL stays for database-native concerns, deploy/migration plumbing, and
  complex PostgreSQL operations where SQL is the clearer or safer expression.
- High-risk raw SQL that remains in runtime code, migrations, or deploy scripts
  needs representative real-Postgres proof in the PR-gated test suite.

## In scope

### Schema gap

Add `noteFiles` to `packages/api/src/db/schema.ts` so runtime code can refer to
 `app.note_files` through the schema layer instead of a migration-only name.

This refactor does not need to convert all `note_files` runtime queries
immediately. The first requirement is to remove the schema blind spot.

### Runtime CRUD conversions

The first implementation slice converts these paths from `db.execute(sql)` to
Drizzle builder calls while preserving route contracts and scoped-connection
behavior:

- `packages/api/src/services/files.ts`
  - `registerFile`
  - `getFileById`
- `packages/api/src/services/settings.ts`
  - `getAiSettings`
  - `updateAiSettings`
- `packages/api/src/services/me.ts`
  - `updateUser`
  - `fetchUser` already uses the builder and stays as the reference shape
- `packages/api/scripts/seed-test-account.ts`
  - existing credential update, after the CLI integration proof is in place

The upload-lease helpers in `files.ts` stay SQL-first. They use row locks,
database functions, or an atomic `UPDATE ... RETURNING` plus
`INSERT ... SELECT` CTE. Project CRUD is a later slice because its member join,
keyset pagination, statistics function, and `SECURITY DEFINER` helpers should
be reviewed together rather than partially rewritten here.

### Real-Postgres proof

Add PR-gated integration proof for the two currently weak areas:

- `packages/api/scripts/seed-test-account.ts`
  - execute the same CLI entry point used by Fly release commands
  - prove create, idempotent re-run, and credential-update behavior against a
    real Postgres instance with better-auth wired normally
  - keep this in `pnpm --filter @harpa/api test:integration`, not in a
    post-deploy-only workflow
- Legacy-data backfill migrations
  - add a reusable test harness that can load a pre-migration schema snapshot,
    seed representative legacy rows, apply the target migration(s), and assert
    the post-migration state
  - use it first for the existing data-moving migrations that matter to the new
    boundary, specifically `0010_note_files.sql` and `0011_files_project_scope.sql`

Going forward, any migration that transforms existing rows rather than only
adding structures must ship with the same style of legacy-data proof.

## Out of scope

Do not convert or redesign these in this refactor:

- `withScopedConnection`, `SET LOCAL`, raw scope setup, or any auth middleware
- RLS policies, grants, domains, `SECURITY DEFINER` helpers, and migration SQL
- complex atomic SQL such as report-number allocation in `createReport`
- aggregate/reporting queries in `me.ts` (`fetchUsage`, `listUsageEvents`)
- project list/detail/member queries and database helper calls
- note batching and attachment fan-out SQL in `notes.ts`
- report generation/finalization SQL and attachment sanitization flows
- any attempt to rewrite the entire API to "zero raw SQL"

Those areas are load-bearing PostgreSQL behavior, not ordinary CRUD cleanup.

## Phased plan

### Phase 0 — prove the risky SQL first

Land tests before the builder conversions.

- Add a `seed-test-account` integration test that boots Testcontainers
  Postgres, wires `auth` normally, runs the script logic, and verifies:
  - configured users are created
  - credential rows are linked
  - a second run is idempotent
  - password updates replace the credential hash rather than duplicating rows
- Add a migration-backfill test helper for:
  - applying migrations only up to a chosen point
  - seeding old-shape rows through admin SQL
  - applying the target migration(s)
  - asserting transformed rows and preserved invariants
- Use that helper to cover:
  - `0010_note_files.sql`: legacy image notes become `note_files` rows and the
    old image columns are cleared
  - `0011_files_project_scope.sql`: legacy file attachments receive the
    expected `project_id` and `report_id`

This phase closes the biggest confidence gaps before any behavior-preserving
refactor starts.

### Phase 1 — add the missing Drizzle model

Add `noteFiles` to `db/schema.ts` with the existing column names and table
ownership only. No route behavior should change in this phase.

This gives later builder work a complete schema surface and removes the current
"runtime table without ORM model" inconsistency.

### Phase 2 — convert the simple CRUD modules

Convert the in-scope functions one module at a time, keeping existing tests
green after each slice.

Recommended order:

1. `settings.ts`
2. `files.ts` registration and lookup only
3. `me.ts` self-update
4. `seed-test-account.ts` credential update

That order starts with the smallest, lowest-risk surfaces. Project reads and
writes remain a separately reviewable follow-up.

### Phase 3 — document the remaining raw SQL exceptions

For any raw SQL block left in these touched files, add a short comment that
states:

- why builder syntax was rejected there
- what invariant the SQL relies on
- which integration test proves it

This keeps future reviewers from having to re-derive the boundary from scratch.

## Testing strategy

Use the repo's existing proof style rather than new infrastructure:

- Testcontainers Postgres via `startPg()`
- route-level integration tests for externally visible behavior
- scope tests with paired positive and negative controls where RLS matters
- direct script-level integration tests for deploy-only code

The builder conversions are intentionally behavior-preserving, so most new
tests should attach to existing integration files instead of creating parallel
"same behavior, different implementation" suites. New dedicated tests are
justified for:

- `seed-test-account`
- migration backfill harness coverage

## Acceptance criteria

- `db/schema.ts` declares `noteFiles` for `app.note_files`.
- The first-slice CRUD functions no longer use raw `db.execute(sql)` for their
  row reads or writes.
- `seed-test-account` has a PR-gated real-Postgres integration test that would
  fail if the script stopped creating or updating configured credential users.
- `0010_note_files.sql` and `0011_files_project_scope.sql` have legacy-data
  migration tests that prove the backfill result, not just fresh-db success.
- Existing route behavior, RLS behavior, and response shapes remain unchanged.
- Complex SQL called out in "Out of scope" remains untouched in this refactor.

## First-slice result

This slice removes six authored `.execute` call sites, reducing the branch
snapshot from 90 to 84:

- settings read and upsert
- file registration and lookup
- profile self-update
- test-account credential update

It also adds the missing `noteFiles` model and real-Postgres regression tests
for the deploy seeder and migrations 0010/0011 with representative legacy
rows. The remaining SQL is not assumed safe merely because it remains; later
slices should follow the boundary and proof requirements above.

## Correctness follow-up

The repo-wide review found three SQL boundaries that needed direct repair:

- Concurrent note-file appends now lock the parent report before the note,
  preserving report-delete lock order while serializing position allocation.
  Real-Postgres tests cover append-versus-append and append-versus-delete.
- API startup now starts the application Postgres rate-limit GC scheduler.
  Tests cover boot wiring, cross-pool atomic consumption, and stale-row cleanup.
- The migration runner owns transaction boundaries. It removes the known outer
  wrapper from migrations 0014, 0019, and 0022 without modifying those applied
  files, keeps each body and ledger write atomic, and rejects transaction
  control in future migration files.

## Rollout and rollback

Ship this as short slices, not one broad rewrite:

1. proof harnesses
2. `noteFiles` schema addition
3. settings, file registration/lookup, self-profile CRUD, and the typed
   credential update
4. project CRUD as a separately reviewed follow-up

Rollback is straightforward because the database contract does not change in
the builder-conversion phases: revert the offending refactor commit and keep
the new tests. The migration-proof harness should remain even if a later code
slice is reverted.
