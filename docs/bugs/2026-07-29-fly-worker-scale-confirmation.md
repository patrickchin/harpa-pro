# 2026-07-29 — Fly worker scale confirmation skipped lifecycle arming

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The first `api-dev` push after PR #205 deployed merge
`9de3cda1`, applied `0022_r2_object_lifecycle.sql`, and started the new
storage worker, but the workflow then failed in its combined deploy step.
The `/readyz` check, post-deploy journeys, API-dependent OTA, and monotonic
storage-lifecycle arming never ran.

**Root cause.** The Fly deploy created one active `storage-worker` Machine and
one stopped standby. The following `flyctl scale count storage-worker=1`
therefore planned to remove one Machine. Current `flyctl` requires `--yes` for
that scale-down in a noninteractive runner. Because the shell used
`set -euo pipefail`, the prompt failure stopped execution before
`storage:arm-leases`.

**Fix.** Pass `--yes` to both the dev workflow and production deploy script
when converging `storage-worker` to one Machine. This preserves the required
order: deploy, converge the worker count, then arm the monotonic rollout.

**Test.** `storage-lifecycle-deploy-policy.test.sh` enumerates every
storage-worker scale command under the Fly and workflow deployment surfaces,
requires explicit noninteractive confirmation, and still executes the
production sequence through its fake `flyctl`.

**Pattern.** A deployment command that may reduce resources must encode its
confirmation policy in source. A fake CLI that records arguments will not
reproduce a real provider's interactive prompt, so the policy test must assert
the noninteractive flag explicitly.
