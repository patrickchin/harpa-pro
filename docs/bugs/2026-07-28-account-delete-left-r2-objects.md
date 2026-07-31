# 2026-07-28 — Account deletion left R2 objects behind (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** `DELETE /me` removed the account and `app.files` rows but
left their R2 objects. Uploads without a file row were also orphaned,
and a still-valid shared-project presign could PUT after deletion.

**Root cause.** The storage abstraction had no delete/list operations,
the delete transaction persisted no storage work, and presigned keys
did not exist in Postgres until registration. Fixture-only tests made
the missing default R2 behavior invisible. An intermediate in-memory
post-commit plan still lost work on crash, raced membership decisions,
and could not catch a late shared-project PUT safely.

**Fix.** `fix(api): enforce R2 object lifecycle` adds:

- `app.file_upload_leases` before every client presign response;
- a committed exact-key lease before every server-rendered PDF PUT;
- atomic lease consumption with file registration;
- SQL-side account planning under user/project/member/file/lease locks;
- durable due-now and post-expiry `app.storage_delete_jobs`;
- a real `FOR UPDATE SKIP LOCKED` retry worker in prod and dev;
- expired-lease pruning that deletes unconsumed orphans before metadata;
- a fail-closed, monotonic rolling-deploy grace for legacy presigns.

The final job repeats every unexpired lease key and keys still inside
the 30-second in-flight PUT safety window, including consumed leases because
registration does not revoke a signed URL. Shared-project prefixes are never
swept.

**Test.** The live test boots Postgres and MinIO without storage
injection. It first forces PDF registration to fail after a real R2 PUT
and proves lease GC removes that exact orphan. It then mints through
`/files/presign`, deletes Alice, performs a late PUT with the still-valid URL,
runs the real default drainer, and proves Alice's object disappears while
Bob's shared control survives.
Additional Testcontainers coverage proves atomic jobs, actual job-row
removal, member add/update/remove serialization, rollout monotonicity,
lease-prune/register locking, and durable PDF intent across a forced
post-PUT registration failure.

**Pattern.** R5 — DI stubs become the spec; default wiring silently
broken. Recurrence guards now require both the real route/storage side
effect and durable state that survives the request.
