# Design — low-traffic background maintenance

Status: approved for implementation on 2026-08-25.

## Problem

Harpa has no external users, but production and development each run a
service-less storage worker. An empty worker queries the application database
at least every ten minutes and prunes expired upload leases hourly. On Neon's
five-minute idle suspension window, those harmless queries keep both computes
billed for roughly half of every day.

The deployed API process also starts three ten-minute garbage-collection
timers for application rate-limit buckets, admin rate-limit buckets, and
idempotency keys. Those timers only run while an API Machine is awake, so they
are secondary to the storage worker, but their current cadence is also
unnecessary at this traffic level.

## Decision

Use a startup reconciliation followed by a 24-hour low-traffic maintenance
cadence:

- discover storage jobs and prune expired upload leases when the worker starts,
  then at most once every 24 hours while that process remains running;
- garbage-collect application rate-limit, admin rate-limit, and idempotency
  rows at most once every 24 hours per running API process;
- keep hourly worker memory telemetry on an independent timer that does not
  query the database;
- preserve the storage worker's one-minute infrastructure-error retry and each
  claimed job's persisted retry schedule; and
- preserve the immediate `DELETE /me` cleanup attempt.

The startup and daily polls are reconciliation boundaries, not the normal
deletion path. They recover durable jobs if the API process exits after the
database transaction, R2 is temporarily unavailable, or a presigned upload
arrives after account deletion. A restart can therefore reconcile sooner than
24 hours, but it has already woken the database and does not create another
idle billing tail. Removing reconciliation entirely would require a separate
durable event-delivery system and would still benefit from an occasional safety
sweep.

As of September 1, 2026, production and development deploy with an emergency
override: `BACKGROUND_MAINTENANCE_ENABLED="0"` in Fly. That keeps the worker
process alive but DB-idle and prevents the API process from starting its
database-backed garbage collectors. It is an operational pause layered on top
of this design, not a new steady state.

## Safety and trade-offs

The worker remains bounded and idempotent. Known work already visible to the
worker wakes at its stored `run_after`; a new job inserted while an idle worker
is sleeping can wait up to 24 hours. Expired upload leases and orphaned objects
can also wait up to 24 hours. This latency is acceptable while the product has
no external users and the route fast path handles ordinary deletion
immediately.

Fly's DB-backed `/readyz` check remains unchanged. It is required to reject an
API image whose database is unavailable or whose migration ledger does not
match. The API Machines can suspend to zero, so this check is not the steady
idle wake source. The worker's hourly memory timer reads only local process and
Machine metrics; it does not wake Neon.

Before external users or a cleanup service-level objective shorter than one
day, revisit this decision. Prefer durable event delivery with a daily
reconciliation sweep over returning to frequent empty polling.

## Verification

- Worker scheduling tests cover empty-queue daily sleep, earlier known work,
  lease-prune deadlines, and the minimum retry delay.
- Maintenance-timer tests prove that default garbage collection does not run
  before 24 hours and runs when the daily boundary is reached.
- Existing storage lifecycle integration tests continue to prove immediate
  deletion, durable retry, late-upload cleanup, and lease pruning.
