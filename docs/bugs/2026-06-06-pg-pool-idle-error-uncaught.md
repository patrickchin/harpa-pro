# 2026-06-06 — pg pool idle-client error crashes the worker (HARPA-PRO-A)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Sporadic `Error: read ETIMEDOUT` reported in Sentry on the
API as a **fatal**, **unhandled** event
(`mechanism: auto.node.onuncaughtexception`,
`level: fatal`,
`syscall: read`, `errno: -110`, `code: ETIMEDOUT`,
`transaction: GET /readyz`). The `transaction` tag was misleading —
`/readyz` was just the next request the freshly-replaced Fly machine
served after the crash and replay. Frequency was low (3 events across
several days on `harpa-pro-api@0.1.3+4408354` in the dev environment),
but each occurrence killed the Node process and Fly had to roll the
machine.

**Root cause.** `getPool()` in `packages/api/src/db/client.ts` builds a
`pg.Pool` and never registers a listener for the pool's `error` event.
Neon kills idle Postgres connections after a few minutes of
inactivity. When that happens the underlying TLS socket emits
`error` ⇒ pg re-emits it on the **pool** (not on a query promise,
because no query is in flight). The pg docs are explicit:

> When a client is sitting idly in the pool it can still emit
> errors because it is connected to a remote host. … **It is
> important you add an event listener to the pool to catch errors.**
> Just like other event emitters, if a pool emits an `error` event
> and no listeners are added node will emit an `uncaughtException`
> and potentially crash your node process.

That's exactly what we hit. Sentry's autoinstrumentation captured the
uncaught exception, attached the trace context of whatever request was
in flight (the `/readyz` health probe in this case), and tagged it as
fatal. The pool's internal client cleanup still ran — pg removes the
broken client from the pool — so the next request reconnects fine.
The crash itself was the only damage.

**Why we missed it offline.** Testcontainers Postgres doesn't reap
idle connections, so the `error` event never fires in CI. Dev only
sees it after the API has been idle long enough for Neon to cull a
client. Pitfall 13 (default-wiring rule) applies: the pool's *real*
event surface was never exercised by any test.

**Fix.** Register a single `pool.on('error', …)` listener at
construction time that forwards the error to
`captureApiException()` with a synthetic
`route: 'pg.pool.idle-client'` tag (so Sentry groups these
separately from request-bound errors and ops can see when Neon is
churning idle clients). The listener exists purely to take Node out
of the "no listeners ⇒ uncaughtException" path; pg already
removes the bad client from the pool internally.

Test: `packages/api/src/__tests__/db/pool-error-handler.test.ts`.
Asserts `pool.listenerCount('error') > 0` on the *default* factory
output, then emits a synthetic ETIMEDOUT and confirms it's absorbed
without throwing and reported to Sentry. This is the
default-wiring assertion the original P4 hardening pass omitted.

**Related.** Tagged `(R5)` because the failure mode is the same shape
as the rest of the R5 catalogue: a happy-path collaborator (the pool)
silently lacks a critical handler that no test exercised.
