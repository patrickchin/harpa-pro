# 2026-07-28 — process-local idempotency duplicated AI work

> See [`README.md`](README.md) for the index of all bug entries and
> patterns.

**Symptom.** Report generation, voice transcription, and voice-note
ingestion accepted `Idempotency-Key`, but two simultaneous requests
could both reach the AI provider. A retry routed to another Fly machine
also missed the cached response. The mobile report screen did not send
an idempotency key at all.

**Root cause.** `MemoryIdempotencyStore` exposed separate `get()` and
`put()` operations. Two requests could both observe a miss before either
stored its response, so the middleware had a classic check-then-act
race. The map was process-local, which also made every other machine an
unavoidable miss. Cache identity contained only route name, user, and
client key, so generate/regenerate or two report resources could replay
one another when clients reused a key.

**Why tests missed it.** The original integration suite sent requests
sequentially to one in-process app. It proved cached replay, per-user
scope, malformed-key handling, and 5xx release, but never overlapped two
handlers, varied method/path/body under one key, or constructed two
stores backed by shared infrastructure. The report hooks also had no
test proving that per-call headers reached the API client.

**Fix.** Migration `0021_idempotency_keys.sql` adds a durable response
and lease table. `PostgresIdempotencyStore.getOrExecute()` atomically
elects one producer, heartbeats its lease without holding a connection,
persists completed responses, and makes other machines replay them while
lease ownership remains healthy. Zero-row renewals are latched as
definitive lease loss. A thrown heartbeat query is ambiguous, so an
owner-token-guarded completion or release decides ownership instead of
discarding a still-valid claim. The original owner cannot return or
cache success after a proven mismatch.
The memory implementation coalesces an in-flight promise. Middleware
identity now includes method, concrete path, and body hash. Generated
mobile report mutations accept headers, and the report route retains a
key plus its original generate/regenerate operation after an ambiguous
failure. A matching success or definitive 4xx response retires the key.

**Tests.**

- `packages/api/src/__tests__/idempotency.test.ts` covers scoped keys
  and in-process overlap.
- `packages/api/src/__tests__/idempotency.postgres.integration.test.ts`
  covers the migration, shared responses, atomic producer election,
  expired-lease recovery, failed-owner release, ambiguous heartbeat
  handling, and ownership reclaimed from a still-running producer.
- `packages/api/src/__tests__/idempotency.integration.test.ts` drives
  the default Postgres wiring through `/voice/transcribe` and asserts
  that two requests record one AI usage event.
- Mobile hook and retry-key tests cover header forwarding and key
  lifecycle.

**Residual boundary.** This coalesces calls only while lease ownership
is healthy. If a worker dies, pauses, is suspended, or loses DB
connectivity long enough after the AI provider accepted the call, its
lease can expire and a retry can run while the first provider call is
still active. The original owner reports lease loss when observable,
but that cannot undo an external side effect. Exactly-once protection
requires a durable async job/outbox around the provider operation.
