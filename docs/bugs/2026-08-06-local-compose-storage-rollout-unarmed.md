# 2026-08-06 — Local Compose left storage rollout closed (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The focused account-deletion Maestro flow entered the correct
confirmation email and tapped Delete, but the sheet remained open with
“Account deletion is temporarily unavailable.” PostgreSQL logged
`file_upload_lease_rollout_pending` from `app.delete_current_user()`.

**Root cause.** Migration 0022 intentionally creates
`app.storage_lifecycle_rollout` closed so an old production machine cannot mint
lease-less presigns during a rolling deploy. Production automation and
Testcontainers arm that gate, but the default local Compose path only ran
migrations before seeding accounts and starting the API. Every fresh local
database therefore kept lease enforcement and account deletion disabled.

**Fix.** The local Compose migration one-shot now runs the existing
`storage:arm-leases` command after `db:migrate`, with zero grace and account
deletion enabled. A disposable local stack has no old API machines or
outstanding presigns; deployed environments retain the guarded 330-second
rollout. Because deletion creates durable immediate and delayed cleanup jobs,
Compose also runs the storage worker against the same Postgres and MinIO
services. The API waits for that worker to start, and Compose restarts it after
process failures so final passes and retries are not stranded.

**Test.** Release-confidence policy requires the local-only values and ordered
migrate-then-arm command, the worker's migration/MinIO dependencies and live
storage configuration, its restart policy, and the API startup dependency. A
fresh-volume Compose probe asserts
`file_upload_leases_enforced() = true` and `account_delete_enabled = true`; the
worker must remain running, and the focused account-deletion Maestro flow
proves the default route side effect.

**Pattern.** R5 — integration tests armed the gate in setup, while the default
local wiring used by device E2E did not.
