# 2026-08-25 — idle polling exhausted Neon compute (Pattern R19)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The application Neon project exhausted its monthly compute
allowance even though Harpa had no external users.

**Root cause.** Each service-less storage worker queried an empty durable
cleanup queue at least every ten minutes. Neon's idle-suspension tail kept
compute active after each query. Raising only the idle-discovery interval would
not have fixed the problem because the same loop also forced upload-lease
pruning hourly. API-process database garbage collectors used ten-minute
defaults as well, though they were secondary because HTTP Machines can suspend.

**Fix.** Keep `DELETE /me` as the immediate cleanup path and retain the durable
queue as crash, R2, and late-upload recovery. In the current zero-user operating
mode, reconcile and prune on worker startup, then discover unknown jobs and
prune upload leases at most once per 24 hours while the process remains running.
Use the same daily default for application rate-limit, admin rate-limit, and
idempotency garbage collectors without enabling a new production timer. Known
jobs already visible to the worker still wake at their persisted `run_after`.

**Test.** `storage-worker-schedule.test.ts` proves empty daily sleep, earlier
known work, the daily lease-prune deadline, and the one-second overdue floor.
`low-traffic-maintenance-cadence.test.ts` advances fake time across the daily
boundary and exercises all three real database-backed garbage collectors.

**Pattern.** R19 — idle polling defeats scale-to-zero.
