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

**Follow-up after #213.** The first `dev` push with narrow repair deployed
exact SHA `674ec212` and selected the surviving current-release stopped standby.
Clearing `standby-for` returned success, but Fly logged:
`machine was in a non-started state prior to the update so leaving the new version stopped`.
The fresh-inventory guard then correctly blocked the clone, arming, journeys,
and API-dependent OTA. A successful `machine update` therefore does not prove
that a previously stopped Machine was started.

**Fix.** Remove broad worker scaling from dev and production. The required
order is deploy, narrow topology repair, read-only started-worker verification,
then monotonic arming. Repair is a no-op only for the exact healthy pair: one
current-release active worker and one stopped, service-less current-release
standby watching it. A singleton active worker is freshly re-listed and must
remain the same sole started/no-standby id before it gets one standby clone. A
singleton stopped standby has its standby configuration cleared, then a fresh
inventory must prove that the same Machine is the sole current-release,
service-less worker without a standby. If it remains stopped, repair runs
`flyctl machine start ID --app APP`; if the update already started it, repair
does not start it redundantly. Start verification polls at most ten fresh
inventories three seconds apart and permits only that same candidate in
`stopped`, `starting`, or `started` state. The clone is blocked until the exact
candidate is `started`. A retry from the exact singleton stopped/no-standby
state starts it; a retry from the exact singleton started/no-standby state
clones it.

Every Machine must match the deployed app Machines on nonempty Fly release id,
release version, and image. Each transition also proves the candidate id,
singleton topology, empty services, and empty standbys. Both mutating branches
list Machines again and succeed only after observing the exact healthy pair;
other initial or transitional topologies fail closed.

**Test.** `storage-lifecycle-deploy-policy.test.sh` forbids explicit
`storage-worker` scale commands under the Fly and workflow deployment
surfaces, then executes the production deploy through its fake `flyctl` and
asserts the deploy-to-repair-to-verify-to-arm order.
`repair-storage-worker-topology.test.sh` covers the exact healthy no-op,
singleton active and singleton standby recovery, zero/ambiguous/transitional
inventories, stale or incomplete release identity, exact-candidate proofs
before cloning and after update/start, bounded start polling, stopped/started
partial retries, verify-before-clone, and fresh-inventory verification after
cloning with fake Fly commands.
`verify-storage-worker-started.test.sh` keeps the final read-only state check.

**Pattern.** A provider confirmation prompt can identify a destructive
assumption rather than missing automation. Service-less process groups may
have provider-managed standbys; do not normalize their count after deploy.
Recovery must prove an exact current-release Machine identity before changing
standby configuration. Provider update success does not prove a stopped Machine
started; use an explicit start plus fresh exact-candidate inventory checks. A
clone command is not success until a fresh inventory proves the active/standby
relationship.
