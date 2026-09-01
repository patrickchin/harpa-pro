# 2026-09-01 — lifecycle arming OOMed the storage worker

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The production API release completed and all Machines received the
new image, but the deployment stayed inside its Fly step until cancellation.
The storage worker restarted before the workflow could reach readiness and
journey verification.

**Root cause.** Post-deploy lifecycle arming used `flyctl ssh` to start a second
`pnpm` and `tsx` process inside the 256 MB storage-worker Machine. That transient
process exhausted the worker's memory; Fly logged an OOM kill while the SSH
session remained open. The same command completed normally on the 512 MB app
Machine.

**Fix.** Keep worker repair and verification in their existing order, then run
the monotonic lifecycle-arm command through the app process group. It still
inherits the production database secret inside Fly, without putting a second
runtime inside the memory-constrained worker.

**Test.** `storage-lifecycle-deploy-policy.test.sh` executes the production
deploy wrapper with a fake Fly CLI and requires the final arming action to use
`--process-group app` after worker verification.

**Pattern.** Deployment-side maintenance must account for the memory already
used by the target process; a one-off command is still concurrent workload.
