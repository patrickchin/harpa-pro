# 2026-08-05 — Admin activity E2E clock drift

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The admin browser test expected four detail events after choosing
Past week, but the activity list became empty once the real date advanced.

**Root cause.** The API harness seeded activity at fixed times on 2026-07-29,
while the browser calculated relative `from` filters from its live wall clock.
The fixture and filter therefore drifted apart even though product behavior was
unchanged.

**Fix.** Freeze the Playwright page clock at 2026-07-30 before navigation so
the relative filters and fixed activity fixture share one time reference.

**Test.** `apps/admin/tests/admin-activity.spec.ts` exercises Past week against
the Docker-backed API and asserts that all four detail events remain visible.

**Pattern.** Tests that combine fixed timestamps with relative date filters
must also control the clock that produces those filters.
