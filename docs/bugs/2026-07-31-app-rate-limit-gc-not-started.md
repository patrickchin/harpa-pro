# 2026-07-31 — application rate-limit GC was never started (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Production PostgreSQL rate-limit buckets could accumulate
indefinitely even though the limiter implemented a periodic cleanup scheduler.

**Root cause.** `src/server.ts` started the admin rate-limit and idempotency
workers but omitted `startRateLimitGc()`. Tests covered the limiter and
middleware behavior without exercising the server entry-point wiring.

**Fix.** Start the application rate-limit scheduler during server boot and keep
the existing memory-backend no-op behavior.

**Test.** `server-rate-limit-gc.test.ts` imports the real server entry point and
asserts all cleanup workers start. `rate-limiter.postgres.integration.test.ts`
proves cross-pool atomic consumption and stale-row cleanup against PostgreSQL.

**Pattern.** R5 — DI stubs become the spec; default wiring silently broken.
