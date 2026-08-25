# 2026-08-25 — idle polling exhausted Neon compute (Pattern R19)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The application Neon project exhausted its monthly compute
allowance on August 16 even though Harpa had no external users. Production and
development each accumulated about 50 compute-unit hours.

**Root cause.** Each service-less storage worker queried an empty durable
cleanup queue at least every ten minutes. Neon's five-minute idle suspension
tail kept each 0.25-CU compute active for roughly half of every day. Raising
only the idle-discovery interval would not have fixed the problem because the
same loop also forced upload-lease pruning hourly. Three API-process database
garbage collectors used ten-minute defaults as well, though they were
secondary because HTTP Machines can suspend.

**Fix.** Keep `DELETE /me` as the immediate cleanup path and retain the durable
queue as crash/R2/late-upload recovery. In the current zero-user operating
mode, reconcile and prune on worker startup, then discover unknown jobs and
prune upload leases at most once per 24 hours while the process remains
running. Use the same daily default for application rate-limit, admin
rate-limit, and idempotency garbage collection. Known jobs already visible to
the worker still wake at their persisted `run_after`.

**Test.** `storage-worker-schedule.test.ts` proves empty daily sleep, earlier
known work, the daily lease-prune deadline, and the one-second overdue floor.
`low-traffic-maintenance-cadence.test.ts` advances fake time across the daily
boundary and exercises all three real database-backed garbage collectors.
`storage-worker-memory.test.ts` proves hourly local telemetry remains
independent and can be stopped without waking the database loop.

**Pattern.** R19 — idle polling defeats scale-to-zero.
