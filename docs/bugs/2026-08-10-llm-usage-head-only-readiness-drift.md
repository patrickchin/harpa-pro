# 2026-08-10 — Head-only readiness hid LLM usage drift (Pattern R7)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Development `/readyz` reported the current application migration
head, but `app._migrations` also contained the retired
`0003_llm_usage_events.sql` identity. `app.llm_usage_events` retained that
retired migration's generated `total_tokens`, varchar fixture/status fields,
nullable latency, 64-character model limit, index, and select policy.

**Root cause.** The retired migration had run before the current
`0005_llm_usage_events.sql`. The current migration uses idempotent object
creation, so it could add missing indexes and policies but could not replace an
existing table's column definitions. Readiness compared only the newest
lexical ledger filename, which proved code-versus-head agreement but not the
full ledger or catalog shape.

**Fix.** `0030_reconcile_llm_usage_events_schema.sql` validates legacy data,
then conditionally reconciles the table inside the migration runner's
transaction with bounded lock/statement timeouts. It is a schema no-op on the
already-current production shape. The separate data-only
`0031_remove_retired_llm_usage_ledger.sql` removes exactly the retired filename
without touching `0003_report_last_generation.sql`. Applied migrations remain
immutable.

**Test.** `llm-usage-migration-drift.integration.test.ts` recreates the
observed drift after migration 0029 and proves both forward repairs, preserved
rows, the exact current catalog shape, and exact ledger cleanup. A second path
proves the current production shape is unchanged. A null-latency fixture proves
the migration fails before DDL and records neither repair.

**Pattern.** R7 variant. A current head-only readiness result is necessary but
does not certify older ledger membership or the complete database schema.
