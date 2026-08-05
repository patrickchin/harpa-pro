# 2026-08-05 — admin E2E fixed timestamps expired

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The standalone admin Playwright check began failing across unrelated
pull requests after selecting `Past week`. Removing an actor exclusion returned
HTTP 200, but the activity feed stayed empty instead of restoring four detail
events.

**Root cause.** The real-Postgres E2E harness seeded every activity event at
fixed times on 2026-07-29. Once the rolling seven-day boundary moved past those
times, every filtered response correctly returned zero rows. The assertion made
the failure appear related to exclusion removal even though that request was
correct.

**Fix.** Seed the five events from PostgreSQL's current transaction timestamp
with one- to five-minute offsets, preserving their deterministic order while
keeping them inside every rolling test period.

**Test.** `pnpm --filter @harpa/admin test:e2e` exercises the production filter
path against the two Testcontainers databases and asserts that `Past week`
restores the four detail events after the exclusion is removed.

**Pattern.** Time-window tests must derive seed data from the same run's clock;
fixed calendar timestamps silently become expiry timers for CI.
