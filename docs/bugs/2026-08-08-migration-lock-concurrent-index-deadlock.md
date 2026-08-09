# 2026-08-08 — Migration lock deadlocked concurrent index work

> See [`README.md`](README.md) for the index of all bug entries and patterns.
> See
> [`arch-cicd-and-migrations.md`](../v4/arch-cicd-and-migrations.md) for the
> migration contract.

**Symptom.** Two concurrent application migrators could fail with PostgreSQL
`deadlock detected`. The failure occurred when one migrator reached a
`.notx.sql` file that used `CREATE INDEX CONCURRENTLY`.

**Root cause.** The second migrator blocked inside
`pg_advisory_lock`. Its transaction snapshot stayed active while the statement
waited for the first migrator's session-level lock. The concurrent index build
waited for that older snapshot. Each migrator therefore waited for the other.

**Fix.** The application migrator now polls the session-level lock with
`pg_try_advisory_lock`. A false-result statement finishes before a
100-millisecond JavaScript wait. No lock-wait statement stays active during
that delay. The lock owner keeps the lock across the full apply loop, including
`.notx.sql` files. This keeps one writer. Query errors and invalid lock results
still fail the migration.

**Test.** `migrate.advisory-lock.integration.test.ts` holds a write transaction
open while the first migrator runs a fixture `CREATE INDEX CONCURRENTLY`. It
then starts a second named migrator and proves that PostgreSQL has one granted
advisory lock with no waiting advisory lock. Both migrators finish after the
write transaction ends. The full migration set also runs concurrently and
produces one ledger row per file.

**Pattern.** No existing pattern. A blocking session advisory-lock statement
can conflict with PostgreSQL work that waits for older active statements.
