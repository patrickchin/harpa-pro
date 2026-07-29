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

**Follow-up after #212.** The first `dev` push with the read-only verifier
deployed exact SHA `a3b882a0`, then failed with only stopped Machine
`d8939d9c344038` in the `storage-worker` group. The guard was correct: removing
the scale command could not recreate the active Machine that #210 had already
destroyed. Arming, readiness CI, journeys, and API-dependent OTA remained
blocked.

**Fix.** Remove broad worker scaling from dev and production. The required
order is deploy, narrow topology repair, read-only started-worker verification,
then monotonic arming. Repair is a no-op only for the exact healthy pair: one
current-release active worker and one stopped, service-less current-release
standby watching it. A singleton active worker gets exactly one standby clone.
A singleton stopped standby is promoted, verified started, then cloned. Every
Machine must match the deployed app Machines on nonempty Fly release id,
release version, and image. Both mutating branches list Machines again and
succeed only after observing the exact healthy pair; other initial topologies
fail before mutation.

**Test.** `storage-lifecycle-deploy-policy.test.sh` forbids explicit
`storage-worker` scale commands under the Fly and workflow deployment
surfaces, then executes the production deploy through its fake `flyctl` and
asserts the deploy-to-repair-to-verify-to-arm order.
`repair-storage-worker-topology.test.sh` covers the exact healthy no-op,
singleton active and singleton standby recovery, zero/ambiguous/transitional
inventories, stale or incomplete release identity, verify-before-clone, and
fresh-inventory verification after cloning with fake Fly commands.
`verify-storage-worker-started.test.sh` keeps the final read-only state check.

**Pattern.** A provider confirmation prompt can identify a destructive
assumption rather than missing automation. Service-less process groups may
have provider-managed standbys; do not normalize their count after deploy.
Recovery must prove an exact current-release Machine identity before changing
standby configuration, and a clone command is not success until a fresh
inventory proves the active/standby relationship.
