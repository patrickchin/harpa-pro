# Design — low-traffic background maintenance

Status: approved for the production hotfix on 2026-09-01.

Delivery note: the focused `main` hotfix is validated against its exact-SHA
isolated PR preview. It does not require or imply promotion of the unrelated
commits currently accumulated on `dev`.

## Problem

Harpa has no external users, but production runs a service-less storage worker.
An empty worker queries the application database at least every ten minutes and
prunes expired upload leases hourly. Neon's idle-suspension tail turns those
small queries into sustained compute usage even when every queue scan is empty.

The deployed API process also starts ten-minute garbage-collection timers for
admin rate-limit buckets and idempotency keys. The application rate limiter has
the same default if its scheduler is started. These timers are secondary to the
always-on storage worker, but their cadence is unnecessary at current traffic.

## Decision

Use startup reconciliation followed by a 24-hour low-traffic maintenance
cadence:

- discover storage jobs and prune expired upload leases when the worker starts,
  then at most once every 24 hours while that process remains running;
- default application rate-limit, admin rate-limit, and idempotency garbage
  collectors to 24 hours; production continues to start the admin and
  idempotency collectors without adding a new application-bucket wake source;
- preserve the storage worker's one-minute infrastructure-error retry and each
  claimed job's persisted retry schedule; and
- preserve the immediate `DELETE /me` cleanup attempt.

The startup and daily polls are reconciliation boundaries, not the normal
deletion path. They recover durable jobs if the API process exits after the
database transaction, R2 is temporarily unavailable, or a presigned upload
arrives after account deletion. A restart can reconcile sooner than 24 hours,
but it has already woken the database and does not create another idle billing
tail.

## Safety and trade-offs

The worker remains bounded and idempotent. Known work already visible to the
worker wakes at its stored `run_after`; a new job inserted while an idle worker
is sleeping can wait up to 24 hours. Expired upload leases and orphaned objects
can also wait up to 24 hours. This latency is acceptable while the product has
no external users and the route fast path handles ordinary deletion
immediately.

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
