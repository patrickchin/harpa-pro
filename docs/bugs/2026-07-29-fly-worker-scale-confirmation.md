# 2026-07-29 — Fly worker scale-down removed the active worker

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The first `api-dev` push after PR #205 deployed merge
`9de3cda1`, applied `0022_r2_object_lifecycle.sql`, and started the new
storage worker, but the workflow then failed in its combined deploy step.
The `/readyz` check, post-deploy journeys, API-dependent OTA, and monotonic
storage-lifecycle arming never ran.

**Root cause.** The Fly deploy created one active `storage-worker` Machine and
one stopped standby. The following `flyctl scale count storage-worker=1`
therefore planned to remove one member of the pair, without preferring the
active Machine. Because the shell used
`set -euo pipefail`, Fly's confirmation prompt stopped execution before
`storage:arm-leases`.

**Correction to #210.** Adding `--yes` made CI noninteractive but confirmed the
scale-down. In the observed dev deployment, Fly destroyed the active worker and
retained the stopped standby. The process group was already owned by Fly's
deployment; the extra scale command was both unnecessary and harmful.

**Fix.** Remove explicit worker scaling from dev and production. The required
order is deploy, then arm the monotonic rollout in the deployed worker process
group. Fly retains its active Machine and stopped standby.

**Test.** `storage-lifecycle-deploy-policy.test.sh` forbids explicit
`storage-worker` scale commands under the Fly and workflow deployment
surfaces, then executes the production deploy through its fake `flyctl` and
asserts the deploy-to-arm order.

**Pattern.** A provider confirmation prompt can identify a destructive
assumption rather than missing automation. Service-less process groups may
have provider-managed standbys; do not normalize their count after deploy.
