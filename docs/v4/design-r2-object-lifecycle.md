# Design — R2 object lifecycle

Status: implemented by PR9.

## Problem

`app.files` records registered objects, but it was not enough to make account
deletion remove R2 data reliably:

- application-side planning could classify a project as solo while a
  concurrent membership change made it shared, or the reverse;
- a presigned PUT could land after `DELETE /me`, including a URL whose lease
  had already been consumed by registration because registration does not
  revoke the URL;
- a process crash after the Postgres commit could lose an in-memory cleanup
  plan.

Sweeping a shared-project prefix is not an acceptable fallback because it can
delete surviving members' objects. Correct cleanup therefore needs the exact
key for every live PUT capability and durable work that survives the request.

## Scope

PR9:

- preserves the existing R2 key layout and files API response shapes;
- persists every client-issued presign and server PDF key before R2 can see
  the write;
- atomically enqueues account cleanup with relational deletion;
- reconciles only personal and actually deleted solo-project prefixes;
- runs due-now cleanup from the route and delayed cleanup from a real worker;
- proves the default R2 wiring against MinIO.

It does not add a public file-delete endpoint, change object keys, or implement
report-PDF replacement cleanup.

## Durable records

Migration `0022_r2_object_lifecycle.sql` follows PR6's reserved
`0021_idempotency_keys.sql`. The branches are independent, so PR9 can be tested
without 0021; lexical migration order is correct once both land.

### `app.file_upload_leases`

One owner-RLS row is inserted by `POST /files/presign` before its response.
The report-PDF path also commits the exact server-built key before its R2 PUT:

| Column | Purpose |
|---|---|
| `file_id`, `file_key` | Exact server-minted object identity |
| `owner_id` | Account serialization point and cascade owner |
| `scope`, `project_id`, `report_id` | Scope copied from the validated request |
| `content_type`, `size_bytes` | Metadata registration must match |
| `presign_expires_at` | End of the PUT capability or server-write intent |
| `consumed_at` | Set atomically with the `app.files` insert |

Consumed leases remain until the URL expires because a signed URL is reusable
even after registration. The worker bounds table growth after expiry plus the
30-second safety window:

- expired consumed lease metadata is deleted; `app.files` remains authoritative;
- expired unconsumed leases are row-locked, their exact objects are deleted,
  and only then are the rows removed;
- an R2 failure rolls the lease deletion back so the key remains retryable;
- concurrent registration blocks on the claimed lease and cannot race an
  orphan delete into a live file.

### `app.storage_delete_jobs`

Jobs use `(user_id, job_kind)` as the primary key; they deliberately have no
user foreign key so they survive account deletion.

The payload is:

```ts
interface StorageDeleteJobPayload {
  userId: string;
  exactKeys: string[];
  sweepPrefixes: string[];
}
```

`attempt_count`, `locked_at`, `last_error`, and `run_after` provide durable
claim and retry state. The scoped app role has no table privileges; the API's
raw backend connection owns and drains the table.

### `app.storage_lifecycle_rollout`

This singleton makes the first rolling deploy safe. Migration starts with
enforcement and account deletion closed. New code writes leases but temporarily
accepts a lease-less registration minted by an old machine. The SQL account
deletion function fails closed during that interval.

Only after `flyctl deploy` has replaced the old machines does CI arm
`enforce_after` for 330 seconds: the maximum 300-second presign TTL plus the
30-second safety window. Arming is monotonic and idempotent; later deploys never
move an existing threshold forward or reopen legacy registration.

Production and dev also set `account_delete_enabled=true`. PR previews arm
lease enforcement after the same grace but leave account deletion disabled
because previews intentionally do not provision an always-on storage worker.

## Transaction and lock order

`app.delete_current_user()` is the single owner function for planning and
deletion. In one transaction it:

1. locks the deleting `public."user"` row;
2. verifies rollout enforcement and worker availability;
3. locks member projects in ID order;
4. locks all membership rows for those projects;
5. locks the user's file and lease rows;
6. computes the true solo-project set and ownership transfers;
7. inserts durable storage jobs;
8. performs the existing membership, project, auth, usage, and user deletion.

Presign, client registration, and server-side PDF upload take a key-share lock
on the same user row. Project locks block member insertion through its foreign
key, while membership row locks block role changes and removal. Testcontainers
coverage proves add, update, and remove attempts time out while deletion holds
the decision locks.

The PDF path has two transactions around the non-transactional side effect.
The first commits an unconsumed exact-key lease. The second locks the user and
that lease across `PutObject`, then atomically consumes the lease, inserts
`app.files`, and updates the report pointer. A crash or later DB failure leaves
the first transaction's lease for exact-key GC; deletion between transactions
removes the user and prevents the PUT.

## Account-delete jobs

The initial job is due immediately and contains:

- every owned `app.files.file_key`;
- every lease key, consumed or not;
- `users/<userId>/avatar/`;
- `users/<userId>/scratch/`;
- `projects/<projectId>/` for projects actually deleted as solo.

The final job exists when any lease is unexpired or still inside the
30-second in-flight PUT safety window at planning time. It is due at the
latest such expiry plus 30 seconds and contains every one of those lease keys,
including consumed leases. It has no prefix sweeps. This catches a late or
repeated PUT inside a shared project without touching teammates' keys.

## Executor

`DELETE /me` drains one due job for the deleted user after the database commit
as a latency fast path. It still returns `204` if storage work is retried
because the account transaction has already committed.

`packages/api/src/workers/storage-delete.ts` is the durable executor:

- claims with `FOR UPDATE SKIP LOCKED`;
- uses a millisecond-round-trippable `locked_at` claim token;
- deletes the row only when that exact claim succeeds;
- retries idempotently with exponential delay capped at one hour;
- treats a four-page prefix cap as retryable, so successive attempts drain the
  remaining objects;
- records `attempt_count` and `last_error`, logs failures, and reports them to
  Sentry;
- sleeps until the next known job is due, capped at a ten-minute idle poll, so
  an otherwise idle worker does not query Neon every few seconds;
- prunes expired upload leases once per hour.

Fly runs one service-less worker in production and dev. The HTTP `app` group
can still suspend at zero. Fly owns one started worker plus one stopped standby,
each configured as a `shared-cpu-1x` Machine with 512 MB. The active worker
launches Node through the `tsx` loader directly and logs a structured
process/guest memory sample at startup and hourly. This is a deliberate
always-on cost; the headroom prevents the runtime and Fly guest overhead from
crowding a 256 MB Machine into recurring OOM restarts. Fly's built-in Machine
memory metric remains authoritative for whole-VM saturation.

Preview apps have no worker and cannot call `DELETE /me`.

The route fast-path normally removes the immediate job without waiting for the
worker. A job inserted after the worker calculated its sleep can wait up to ten
minutes, and expired lease cleanup can wait up to one hour. Those bounds trade
cleanup latency for gaps long enough that an idle Neon compute may suspend;
the Fly worker Machine itself remains continuously billed. Known delayed jobs
and retries wake at their stored `run_after` when the worker can already see
them.

## Bounds and safety

- `DeleteObjects` is chunked at the S3 limit of 1,000 keys.
- Prefix pages contain at most 500 keys.
- One job attempt reads at most four pages per prefix.
- Shared-project prefixes are never swept.
- Missing objects are successful idempotent deletes.
- Worker passes claim at most 100 jobs; the deployed loop uses 10.
- Lease pruning claims at most 1,000 rows per pass.

## Verification

- storage unit tests cover batch deletion, prefix pagination, bounded sweeps,
  truncation, and retryable failures;
- files integration tests cover lease creation, atomic consumption,
  enforcement, and the rolling-deploy compatibility path;
- reports integration tests prove successful PDFs consume a pre-write lease
  and a forced post-PUT registration failure leaves a durable key that lease
  GC removes;
- account-deletion integration tests cover atomic job payloads, initial-job
  removal, final-job retention, rollout gating, shared-project preservation,
  and concurrent member add/update/remove locks;
- lease-prune integration tests cover consumed metadata, unconsumed orphan
  deletion, registration blocking, and R2 failure rollback;
- the live MinIO test forces PDF registration to fail after a real server PUT
  and proves lease GC removes that exact object; it also mints through the real
  files route, deletes the account, performs a late PUT with the still-valid
  URL, runs the default drainer, and proves the late object disappears while
  Bob's shared control object survives.

## Operational checks

Outstanding jobs:

```sql
SELECT user_id, job_kind, run_after, attempt_count, locked_at, last_error
FROM app.storage_delete_jobs
ORDER BY run_after;
```

Rollout state:

```sql
SELECT enforce_after, account_delete_enabled, armed_at
FROM app.storage_lifecycle_rollout
WHERE singleton;
```

If deployment, narrow worker-topology repair, or verification fails before
arming, account deletion remains intentionally unavailable and legacy
registration remains compatible. Rerun the production deploy script, which
owns the ordered deploy, repair, verify, and arm sequence; do not manually
force the timestamp before old presigns have expired.

## Alternatives rejected

- **In-memory post-commit plan:** loses work on crash and cannot identify late
  shared-project PUTs.
- **Shared-project prefix sweep:** can delete surviving members' data.
- **Pending rows in `app.files`:** broadens the semantics and RLS of the primary
  file table for every reader.
- **Request-opportunistic delayed drain:** fails when the HTTP app is idle or
  suspended.
