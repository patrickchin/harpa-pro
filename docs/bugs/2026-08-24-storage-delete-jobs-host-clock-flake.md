# 2026-08-24 — Storage-delete integration used the host clock

> See [`README.md`](README.md) for the recurring-bug index.

**Symptom.** The full API integration suite could report zero claimed storage
delete jobs, then fail the following test on the leftover job's primary key.
The same six-test file passed when run by itself.

**Root cause.** The test helper used JavaScript `new Date()` as the default
`run_after` value. Under a loaded container runtime, the macOS host clock could
be slightly ahead of the Postgres VM clock, so a job intended to be due now
failed the database's `run_after <= now()` predicate.

**Fix.** Due-now callers omit the test-helper argument, so its SQL
`COALESCE` falls back to Postgres `now()`. Tests that intentionally create a
delayed job still pass an explicit timestamp.

**Test.** The storage-delete integration file exercises both due-now claims
and delayed wake times. The complete Testcontainers lane protects the loaded
full-suite case that exposed the cross-clock boundary.
