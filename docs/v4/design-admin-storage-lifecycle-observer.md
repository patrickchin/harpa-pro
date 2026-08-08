# Design - Admin storage lifecycle observer

**Status:** Draft for a self-initiated stacked pull request. Keep the pull
request unmerged until the operator reviews it.

## Goal

Add a read-only storage lifecycle card to the dedicated administrator
operations page. The card should answer four bounded questions without opening
SQL consoles or inferring provider state:

1. Is the deployment's storage lifecycle rollout currently armed?
2. Is account deletion enabled by the rollout row?
3. Is there durable cleanup work waiting in `app.storage_delete_jobs`?
4. Is the durable queue showing retry or stale-claim pressure?

This card is an operator aid. It is not worker-liveness proof, provider
health, account-deletion authorization, or a replacement for the exact Fly
worker verification and rollout gates in `arch-ops.md`.

## Why this slice is next

The current operations page already covers first-party deployment identity,
readiness, bounded provider facts, and one cost-bearing AI canary. It does not
show the first-party database state that decides whether storage lifecycle
arming finished and whether durable cleanup work is accumulating.

The repository already treats `app.storage_lifecycle_rollout` and
`app.storage_delete_jobs` as the operational source of truth for this area.
Operators are told to query those tables directly when rollout or cleanup
status is in doubt. Surfacing their reviewed aggregates in `/operations`
reduces operator round-trips without adding provider credentials, mutations,
polling, or another monitoring system.

## Evidence boundaries

Keep these evidence classes separate:

1. `GET /readyz` and `GET /admin/readyz` remain customer-facing readiness and
   schema evidence.
2. The new storage lifecycle card is first-party database state only.
3. Fly worker inventory, Fly machine memory, and process state remain provider
   and deployment evidence.
4. Report generation live canary remains an explicit cost-bearing mutation.

The storage lifecycle card must not collapse these classes into one
`healthy/unhealthy` badge. In particular:

- a green rollout row does not prove a worker is running now;
- an empty queue does not prove delayed cleanup can execute;
- a non-empty queue does not prove provider outage or data loss; and
- worker verification still belongs to the deployment workflow and Fly
  inventory checks.

## Route boundary

Add:

```text
GET /admin/operations/storage-lifecycle
```

Use the same dedicated browser-admin boundary as the other operations routes:

1. `Cache-Control: private, no-store` before any rejection;
2. the shared trusted-Fly-IP administrator window;
3. the dedicated administrator cookie session; and
4. a separate 12-request-per-minute identity-and-session limit.

Anonymous requests, Better Auth bearer sessions, and legacy application-admin
bearer tokens must fail before any application-database read.

This route has no request body, no query parameters, no write path, no
background refresh, and no arbitrary SQL surface. The browser calls it once
after the dedicated session is confirmed and again only when the operator
presses the shared **Refresh** button.

## Fixed database read plan

One observation uses exactly one fixed application-database statement under a
five-second deadline. A database-clock CTE, the singleton rollout row, and one
aggregate over `app.storage_delete_jobs` produce one consistent snapshot.

There is no retry loop, pagination, history scan, per-user drill-down, or
payload expansion.

The statement selects only `armed_at`, `enforce_after`,
`account_delete_enabled`, and `updated_at` from the rollout row. It also calls
the existing `app.file_upload_leases_enforced()` function and derives actual
account-deletion availability as:

```text
leaseEnforcementActive AND accountDeleteEnabled
```

This matches the database function that guards `app.delete_current_user()`.
The route requires exactly one singleton row. A missing row is an invalid
state and fails closed.

### Queue aggregate

The same statement reads one aggregate snapshot from
`app.storage_delete_jobs` using its database-clock CTE. The snapshot may derive
only reviewed aggregate fields such as:

- total jobs;
- job counts by `job_kind`;
- due-now jobs;
- future-scheduled jobs;
- active claims whose `locked_at` is inside the worker's five-minute lease;
- stale claims whose lease has expired;
- jobs with a stored retry error;
- highest observed `attempt_count`;
- oldest due `run_after`; and
- next future `run_after`.

The query must not return or group by:

- `user_id`;
- `payload.userId`;
- `payload.exactKeys`;
- `payload.sweepPrefixes`;
- raw `last_error` text; or
- per-row `locked_at` values.

The aggregate card is for operator orientation, not forensic replay. If the
operator needs exact row-level details, the existing SQL procedures remain the
source of truth.

## Strict response contract

`operations.storageLifecycleObservation` is a strict discriminated union.

An unavailable observation is:

```ts
{
  observedAt: string;
  status: 'unknown';
  reason:
    | 'rollout_state_missing'
    | 'timeout'
    | 'database_unavailable'
    | 'invalid_response';
}
```

An available observation contains only this allowlist:

```ts
{
  observedAt: string;
  status: 'available';
  rollout: {
    armedAt: string | null;
    enforceAfter: string | null;
    accountDeleteEnabled: boolean;
    leaseEnforcementActive: boolean;
    accountDeletionAvailable: boolean;
    updatedAt: string;
  }
  jobs: {
    total: number;
    initial: number;
    final: number;
    dueNow: number;
    scheduled: number;
    activeClaims: number;
    staleClaims: number;
    retrying: number;
    maxAttemptCount: number;
    oldestDueAt: string | null;
    nextRunAfter: string | null;
  }
  caveats: Array<
    | 'db_state_not_worker_liveness'
    | 'queue_counts_not_provider_health'
    | 'empty_queue_not_execution_proof'
  >;
}
```

All counts are non-negative safe integers. All timestamps are finite ISO
timestamps or `null`. `scheduled` excludes `dueNow`. `activeClaims` and
`staleClaims` are disjoint. `retrying` counts rows with a non-null
`last_error`; it is a durable retry indicator only and never exposes that
text. `accountDeletionAvailable` must equal `leaseEnforcementActive AND
accountDeleteEnabled`.

Do not return:

- queue payloads or object keys;
- raw SQL errors or stack traces;
- raw `last_error` text;
- user identifiers;
- project identifiers;
- R2 bucket or object names; or
- Fly machine identifiers.

## Presentation

Add a distinct **Storage lifecycle** section to `/operations`, near the other
first-party evidence rather than among external vendor links.

The card should show:

- rollout marker: `Recorded` or `Missing` from `armedAt`;
- lease enforcement: `Active` or `Inactive` from the database function;
- account deletion: `Available` or `Blocked` from the exact two-part gate;
- the rollout row's `armedAt`, `enforceAfter`, and `updatedAt` timestamps;
- durable queue counts with clear labels; and
- reviewed interpretation notes.

Suggested operator copy:

- `Recorded` means the rollout row contains its deployment arming marker.
- `Active` means the enforcement threshold has passed according to the
  database clock.
- `Available` means both lease enforcement and the independent account-delete
  flag are active.
- `Due now` means work is currently eligible to be claimed from the queue.
- `Stale claims` means a claim has outlived the worker's five-minute claim
  lease and may need operator attention.

The card must also show a short fixed note:

> This database state does not prove a storage worker is running now. Use Fly
> worker verification and deployment evidence for executor proof.

Loading and failure behavior remains per-surface. A storage lifecycle failure
must not erase valid deployment identity, readiness, provider usage, or canary
results.

## Deliberate limits

- Do not call Fly, Cloudflare, Neon, Better Stack, Sentry, or GitHub for this
  slice.
- Do not add worker heartbeats, synthetic queue writes, job replays, repair
  buttons, or alert configuration.
- Do not expose row-level queue contents, even to an authenticated admin page.
- Do not infer that a queue backlog means provider outage, stuck deploy, or
  guaranteed data loss.
- Do not infer worker liveness from `activeClaims`, `staleClaims`, or any other
  database-only field.
- Do not add polling. Check once on page load and again only on manual
  **Refresh**.

These limits keep the card useful without turning `/operations` into a mutable
ops console or a second deployment verifier.

## Verification

Tests must prove:

- the contract schema accepts only the reviewed allowlist and excludes queue
  payload, `last_error`, and user identifiers;
- anonymous, Better Auth, and legacy application-admin callers fail before any
  database read;
- default route wiring applies `private, no-store`, the trusted-Fly-IP gate,
  the dedicated admin session, and the separate route limit;
- a missing rollout singleton row fails closed as `unknown/rollout_state_missing`;
- aggregate counts, timestamps, availability, and stale-claim classification
  derive from the single fixed database statement only;
- malformed or oversized database values fail closed instead of entering UI
  state;
- the admin component covers loading, available, unknown, refresh,
  signed-out-session rejection, and the explicit worker-liveness caveat; and
- page load performs 11 fixed GET reads, one shared Refresh makes the total 22,
  and no timer or background repeat runs the observer.

Run the focused API route, scope, contract, lint, typecheck, and coverage
lanes plus the admin component tests, lint, typecheck, build, and coverage
lanes. Before merge, protected checks and the `pr-N` admin deployment marker
must both name the exact pull-request head SHA.

## Rollout and rollback

This slice introduces no new environment variable, provider credential, or
deployment toggle. A merged implementation can start returning the reviewed
storage lifecycle observation immediately in environments that already have the
underlying tables.

Preview or dev success proves only that the read contract works. It does not
replace the existing deployment workflow's exact worker verification, topology
repair, lifecycle arming checks, or rollout-table verification.

Rollback removes the route, UI section, and schema definitions. It does not
change queue contents, rollout-row values, worker topology, or account
deletion state.
