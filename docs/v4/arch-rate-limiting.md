# API rate limiting

> Status: implemented for application, waitlist, AI, and browser-admin
> routes. Authentication routes retain an explicit gap described below.
>
> Companion: [`arch-api-design.md`](arch-api-design.md).

The Fly inventory and Harpa-recorded AI usage entries below describe unmerged
draft stacks.

## Model

Harpa Pro uses fixed-window counters. A counter key includes the logical
budget name, actor key, and window start.

The application has two backends:

- `MemoryRateLimiter` stores counters in one process.
- `PostgresRateLimiter` stores counters in `app.rate_limit_buckets`.

The browser admin has a separate `AdminPostgresRateLimiter`. It stores
counters in `admin.rate_limit_buckets` in the admin database.

`RATE_LIMIT_BACKEND=memory` selects memory. `RATE_LIMIT_BACKEND=postgres`
selects Postgres. Live-deployment environment validation requires Postgres.
Local and test environments default to memory.

The repository cannot prove which backend a running deployment currently
uses. Treat deployed backend state as **UNKNOWN** until deployment settings
or a live behavior check verifies it.

## Global application budgets

`packages/api/src/middleware/globalRateLimit.ts` runs before route-specific
middleware.

| Traffic                  | Key       | Limit |   Window |
| ------------------------ | --------- | ----: | -------: |
| Valid Better Auth bearer | User ID   |   600 | 1 minute |
| Other traffic            | Client IP |   120 | 1 minute |

The middleware performs a non-throwing session lookup when an Authorization
header is present. An invalid token stays in the IP bucket.

These paths skip the global application limiter:

- `/healthz`
- `/readyz`
- `/admin/auth/*`
- `/admin/activity`
- `/admin/operations/*`
- `/admin/readyz`
- `/openapi.json`
- `/.well-known/*`

Admin routes use the admin limiter. Readiness, OpenAPI, and app-link
manifests have no Harpa rate limit.

## AI budgets

Each AI route consumes the shared `ai.user` bucket and its route bucket.
Both buckets key by the authenticated user.

| Route                                                  | Route limit | Shared limit |   Window |
| ------------------------------------------------------ | ----------: | -----------: | -------: |
| `POST /voice/transcribe`                               |          30 |           60 | 1 minute |
| `POST /voice/summarize`                                |          60 |           60 | 1 minute |
| `POST /reports/{report}/notes/voice`                   |          30 |           60 | 1 minute |
| `POST /projects/{project}/reports/{number}/generate`   |          30 |           60 | 1 minute |
| `POST /projects/{project}/reports/{number}/regenerate` |          30 |           60 | 1 minute |

The shared key name is identical in `routes/voice.ts` and
`routes/reports.ts`. A Postgres backend therefore shares the budget across
machines and route modules.

Monthly product usage limits are separate. They return `403`
`usage_limit_exceeded`, not `429`.

## Waitlist budgets

| Route                    | Key       | Limit | Window |
| ------------------------ | --------- | ----: | -----: |
| `POST /waitlist`         | Client IP |     5 | 1 hour |
| `POST /waitlist`         | Client IP |    50 |  1 day |
| `POST /waitlist/confirm` | Client IP |    30 | 1 hour |

The hourly and daily signup counters are additive.

## Browser-admin budgets

Admin counters live in the independent admin database when Postgres mode is
active.

| Route or surface                          | Key                        | Limit |     Window |
| ----------------------------------------- | -------------------------- | ----: | ---------: |
| All admin auth and protected data routes  | Trusted Fly client IP      |   120 |   1 minute |
| `POST /admin/auth/login`                  | Trusted Fly client IP      |     3 |   1 minute |
| `POST /admin/auth/login`                  | Trusted Fly client IP      |    20 | 15 minutes |
| Failed admin login                        | SHA-256 of canonical email |     5 | 15 minutes |
| `GET /admin/activity`                     | Admin identity and session |   120 |   1 minute |
| `GET /admin/operations/neon`              | Admin identity and session |    12 |   1 minute |
| `GET /admin/operations/neon-usage`        | Admin identity and session |    12 |   1 minute |
| `GET /admin/operations/r2-capacity`       | Admin identity and session |    12 |   1 minute |
| `GET /admin/operations/fly-inventory`     | Admin identity and session |    12 |   1 minute |
| `GET /admin/operations/storage-lifecycle` | Admin identity and session |    12 |   1 minute |
| `GET /admin/operations/ai-usage`          | Admin identity and session |    12 |   1 minute |
| `POST /admin/operations/report-generate`  | Admin identity and session |     3 | 15 minutes |

The login route checks the IP budgets before password verification. It
consumes the email budget before verification but rejects on that budget only
after invalid credentials. A valid password can succeed when only the email
bucket is exhausted. This prevents an attacker from locking an administrator
out by rotating IP addresses.

In production, `adminClientIp()` accepts a valid `Fly-Client-IP`. Missing or
invalid Fly metadata uses the shared `unknown` bucket. Local and test
requests can use the general IP helper.

The Neon inventory route must pass both its trusted-IP and identity/session
budgets. One allowed request lists at most 20 projects and at most 100 active
branch details per project. Provider requests have no retry loop.

The Neon Free usage route must pass the same two gates and its own
identity/session budget. One allowed request makes at most 22 fixed Neon `GET`
requests under one shared 10-second timeout. It does not retry, follow project
pagination, or use a provider write method.

The R2 capacity route must pass the same two gates and its own identity/session
budget. One allowed request makes at most three fixed provider calls under one
shared 10-second timeout. It does not retry or follow bucket pagination.

The draft Fly inventory route must pass the same two gates and its own
identity/session budget. One allowed request makes at most 31 fixed provider
calls under one shared 10-second timeout. It does not retry, follow redirects,
follow pagination, write to Fly, or expose a polling path. Its output contains
at most ten apps, 50 Machines per app, and 50 Volumes per app. A nullable
process-group value is inventory, not readiness or worker-liveness proof.

The storage lifecycle route must pass the trusted-IP and identity/session
gates before any application-database read. Its separate budget allows 12
requests per minute. One allowed request runs one fixed statement under a
five-second deadline. It has no retry, mutation, or provider call.

The draft AI usage route must pass the same two gates and its own
identity/session budget. One allowed request makes one application-database
aggregate over fixed current-month and previous-24-hour UTC windows. It makes
no provider request. The query returns at most 72 grouped rows. The response
contains at most four normalized provider summaries per window.

The report generation live canary must also pass the trusted-IP budget. Exact
Origin, dedicated admin session, and session-bound CSRF checks run before its
three-per-15-minute identity/session budget. A permitted live run then consumes
the shared AI rate limit and monthly usage limits of the real application
report route. A disabled canary stops before all application and provider work.
Neon inventory, Neon usage, R2 capacity, Fly inventory, storage lifecycle, and
AI usage, and live-canary runs use separate named admin buckets.

## Authentication-route boundary

Better Auth owns `/api/auth/*`. Harpa does not mount `withRateLimit()` on
email-OTP or password sign-in routes. `auth.ts` also does not configure a
Harpa-specific Better Auth `rateLimit` block.

The pinned Better Auth release can apply its built-in production IP limits.
Those counters use Better Auth storage and rules, not
`app.rate_limit_buckets`. Development disables the library limiter by
default.

The repository does not implement the previously documented limits of three
OTP sends per email in 15 minutes or ten sends per IP in one hour. It also
does not configure a trusted Fly IP header for Better Auth. Treat those
controls as **not implemented**, not as deployment settings.

This gap requires an implementation change and integration tests before the
docs can promise email-keyed OTP abuse protection.

## Client IP selection

`packages/api/src/lib/clientIp.ts` accepts the first valid address in this
order:

1. `Fly-Client-IP`
2. `CF-Connecting-IP`
3. the first `X-Forwarded-For` value
4. the literal `unknown`

Fly sets `Fly-Client-IP` on normal deployed traffic. The fallback headers
are useful for local or alternate proxy paths. They must not become a new
trusted production boundary without proxy validation.

## Response contract

A rejected Harpa-managed budget returns `429`:

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Rate limit exceeded."
  },
  "requestId": "..."
}
```

It also returns:

- `Retry-After`
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

Successful requests include the `X-RateLimit-*` headers from the last budget
that wrote them. Chained middleware does not combine multiple successful
budget headers into a tightest-budget result.

Better Auth controls its own `429` response and headers.

## Postgres storage

Migration `0007_rate_limit_buckets.sql` creates
`app.rate_limit_buckets`. Admin migration
`0002_admin_rate_limit_buckets.sql` creates the separate admin table.

`PostgresRateLimiter.consume()` uses one atomic upsert. Independent API
machines therefore increment the same counter.

`src/server.ts` starts cleanup schedulers for both Postgres limiters. Each
scheduler runs every ten minutes and deletes buckets whose full window ended
more than one minute earlier. Memory mode does not start a cleanup timer.

The application rate-limit table is not user-visible. The API accesses it
through the unscoped pool. The admin table revokes `PUBLIC` and has RLS
enabled without policies.

## Local override

`DISABLE_RATE_LIMIT=1` makes `consumeRateLimit()` skip route-specific
budgets. The Docker Compose API sets this development-only override for E2E
journeys.

The global limiter does not read `DISABLE_RATE_LIMIT`. Local E2E traffic can
still consume the global user or IP budget.

Do not set this override in a deployed environment.

## Tests and enforcement

Current tests cover these properties:

- `lib/clientIp.test.ts` covers IP parsing and precedence.
- `__tests__/rateLimit.integration.test.ts` covers a mounted AI route,
  per-user separation, headers, and the error envelope.
- `__tests__/rate-limiter.postgres.integration.test.ts` proves atomic counts
  across two independent pools and tests garbage collection.
- `__tests__/admin-rate-limit.integration.test.ts` covers admin login
  budgets and key selection.
- `__tests__/admin-activity.integration.test.ts` covers the activity budget.
- `__tests__/admin-neon-operations.integration.test.ts` covers the Neon
  inventory identity/session budget and its 12-request limit.
- `__tests__/admin-neon-usage.integration.test.ts` covers the Neon Free usage
  identity/session budget, its 12-request limit, and rejection before provider
  access.
- `__tests__/admin-r2-capacity.integration.test.ts` covers the R2 observer
  identity/session budget, its 12-request limit, and rejection before provider
  access.
- `__tests__/admin-fly-inventory.integration.test.ts` covers the Fly observer
  identity/session budget, its 12-request limit, and no-store rejection paths.
- `__tests__/admin-storage-lifecycle.integration.test.ts` covers the storage
  lifecycle observer budget, its 12-request limit, and rejection before the
  application-database statement.
- `__tests__/admin-ai-usage.integration.test.ts` covers the aggregate
  observer's identity/session budget, its 12-request limit, and rejection
  before an application-database query.
- `__tests__/admin-report-diagnostic.integration.test.ts` covers the isolated
  three-request live-canary budget and proves read routes do not spend it. It
  also proves every response remains private and no-store.
- `__tests__/server-rate-limit-gc.test.ts` checks cleanup scheduler startup.
- `scripts/check-no-process-env-rate-limit.sh` blocks raw
  `process.env.RATE_LIMIT_*` access outside `env.ts`.

The suite does not directly prove the global 600/120 budgets. It also does
not exhaust the shared AI bucket across both report and voice routes. It does
not prove an email-keyed OTP-send budget because that budget does not exist.

## Deferred options

The code does not implement an Upstash backend or per-project budgets. Add
either only with a concrete abuse case, a design update, and default-wiring
tests.
