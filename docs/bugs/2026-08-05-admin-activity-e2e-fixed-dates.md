# 2026-08-05 — Admin activity E2E fixture used fixed dates

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The admin Playwright journey selected **Past week**, received an
empty activity feed, and then could not resolve the seeded actor or project
filter options.

**Root cause.** The database harness always inserted activity at fixed times on
2026-07-29. Once the wall clock moved beyond that rolling seven-day window, the
fixture stopped satisfying the user-visible filter even though its event order
was otherwise correct.

**Fix.** Capture the harness start time before container setup and seed the five
events at one-minute intervals ending at that time. The rows stay in the past,
inside every rolling preset used by the journey, and retain the expected newest
to oldest order.

**Test.** The existing admin Playwright journey exercises the live API and
PostgreSQL harness through the **Past week** filter, then resolves the seeded
actor and project options and verifies all four detail rows remain visible.

**Pattern.** Test data used an absolute calendar date for behavior defined by a
rolling wall-clock window.
