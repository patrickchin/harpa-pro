# 2026-08-05 — rate-limiter Testcontainers teardown emitted `57P01`

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** API integration CI intermittently failed after all 31 integration
files and 219 tests passed. Vitest reported one unhandled PostgreSQL FATAL
`57P01` (`terminating connection due to administrator command`) attributed to
`rate-limiter.postgres.integration.test.ts`.

**Root cause.** That test creates two `pg.Pool` instances outside the shared
database factory. `pg-pool` resolves `pool.end()` after removing idle clients
from its internal list, before every underlying client has necessarily emitted
its final `end`. Stopping the Testcontainers PostgreSQL fixture immediately
afterward could therefore terminate a still-closing idle connection. The pool
re-emitted that shutdown error without a test-local `error` listener, so Node
surfaced it as an uncaught exception even though every assertion had passed.

**Fix.** This PR attaches observers only to the two test-created pools. They
accept code `57P01` only after an explicit teardown flag is set and rethrow
every other pool error. Teardown now waits for every client `remove` event from
both pools before stopping the PostgreSQL fixture, rather than relying on
`pool.end()`'s earlier internal-list boundary. Production pool error handling
is unchanged.

**Test.** `rate-limiter.postgres.integration.test.ts` now proves both ad-hoc
pools have error observers and pins the classifier so `57P01` before teardown
and every other error remain failures.

**Pattern.** Test-owned resources must install their error boundary before use
and keep it active until asynchronous shutdown events have drained.
