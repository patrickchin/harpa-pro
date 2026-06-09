# API rate limiting

> Companion to [arch-api-design.md §Rate limiting](arch-api-design.md#rate-limiting).
>
> Lessons applied: [Pitfall 1](pitfalls.md#pitfall-1--p1-done-without-real-api-tests),
> [Pitfall 13](pitfalls.md#pitfall-13--di-stubs-become-the-spec-default-wiring-silently-broken),
> [Pitfall 15](pitfalls.md#pitfall-15--route-handlers-that-ignore-user-settings).
>
> Status: **live**. Per-route + shared AI + catch-all budgets, the
> `PostgresRateLimiter`, and SMS-pump protection on
> `/api/auth/email-otp/*` are all implemented. The checklist at the
> bottom of this doc remains as the historical roll-out order.

## 1. Problem

P1.9 shipped a per-process `MemoryRateLimiter` keyed by
`(routeName, userId)` and wired it into the AI routes
(`voice.transcribe`, `voice.summarize`, `voice.note`,
`reports.generate`) plus an ad-hoc per-phone limit on
`POST /auth/password/verify` and an inline per-IP limit on
`POST /waitlist`. Six gaps surfaced as the surface grew:

1. **SMS pumping is unbounded.** `POST /auth/otp/start` (Twilio Verify
   send) and `POST /auth/otp/verify` have no rate limit. Twilio charges
   per send; a script can drain the account before a human notices.
2. **No catch-all per-user limit on authed routes.** Cheap reads
   (`GET /me`, `GET /projects`, `GET /reports/.../debug`) have no
   ceiling — a runaway client can hammer the API and saturate the
   Neon pooler.
3. **No catch-all per-IP limit on unauthed routes.** Only `/waitlist`
   has one, hand-rolled inline. `/auth/*` and `/readyz` would all
   benefit from a default ceiling.
4. **The "shared per-user 60 RPM across voice + generate" budget
   promised by [arch-api-design.md §Rate limiting](arch-api-design.md#rate-limiting)
   is not implemented.** Each route has an independent bucket; a
   client can simultaneously consume 30 transcribes + 60 summarises +
   30 generates per minute on the same user.
5. **Per-machine counters are silently wrong in prod.** Production
   runs `min_machines_running = 2` (see [arch-ops.md §Cold starts](arch-ops.md#cold-starts)),
   and Fly burst-scales up to 6 machines. `MemoryRateLimiter` is
   per-process, so the effective budget is `2..6×` the configured one.
   This is the canonical [Pitfall 13](pitfalls.md#pitfall-13--di-stubs-become-the-spec-default-wiring-silently-broken)
   shape: integration tests are green with the memory limiter, the
   default-wired production stack quietly violates the spec.
6. **Client IP extraction is duplicated.** `waitlist.ts::clientIp()`
   is the only implementation; we need it from `/auth/*` and the
   global middleware too.

Acceptance contract:

- Every authed route has either an explicit per-route budget OR is
  covered by a default per-user budget — no authed route is
  rate-limit-free.
- Every unauthed route has a per-IP budget.
- `POST /auth/otp/start` and `POST /auth/otp/verify` cannot send
  more than **3 SMS/15min/phone** + **10 SMS/hour/IP**.
- The "shared across voice + generate" budget is enforced.
- Production deploys use a single distributed limiter so the budget
  is the budget, regardless of machine count.
- A CI lint guard fails any new route that doesn't opt in or out.

Canonical-source files:

- `packages/api/src/middleware/rateLimit.ts`
- `packages/api/src/lib/rateLimiter.ts`
- `packages/api/src/routes/auth.ts`, `waitlist.ts`
- `packages/api/src/app.ts`
- `packages/api/src/__tests__/integration/rate-limit.*`
- `docs/v4/arch-api-design.md` §Rate limiting (rewritten in the same
  PR to reference this doc as the source of truth).

## 2. Alternatives considered

### A. **Adopt `@upstash/ratelimit` directly, drop the in-house abstraction.**
Pros: zero in-house code, well-tested sliding-window algorithm.
Cons: requires Upstash in CI (or a mock — Pitfall 13 again), couples
test ergonomics to a vendor lib, and the existing `RateLimiter`
interface already abstracts the right shape. *Rejected.*

### B. **Continue with `MemoryRateLimiter` everywhere, add per-machine budget = configured/N.**
Pros: no new dependency. Cons: needs to read `fly scale show` at boot,
breaks under autoscale-up between reads, and divides the budget
poorly when traffic is sticky on one machine. *Rejected.*

### C. **(Chosen)** Keep the `RateLimiter` interface; ship a
**`PostgresRateLimiter`** that uses the existing Neon connection
plus an `app.rate_limit_buckets` table. Add a thin
**`UpstashRateLimiter`** sibling later if/when Upstash is introduced
for idempotency/caching, but don't gate this feature on it.

Why Postgres:

- We already have a connection pool, an RLS-free admin namespace
  (`app._migrations` etc.), and migrations.
- One `INSERT ... ON CONFLICT DO UPDATE RETURNING count` is atomic,
  cheap (<1ms on Neon's pooler), and replicates "across machines" by
  definition.
- No new infra cost. No new secret. No new CI dependency.
- A nightly `DELETE FROM app.rate_limit_buckets WHERE window_end < now()`
  keeps the table bounded.

Cost ceiling: the AI route budgets cap at ~30 RPM/user. Even at 1000
concurrent users that's ~500 RPS of rate-limit queries — well inside
Neon's headroom. Fast routes (auth/OTP) cap at 3-10/min, negligible.

This matches Pitfall 13's "cover the default factory" rule: the
default-wired production stack uses the same backend as integration
tests (Postgres via Testcontainers), so we cannot have a "tests pass,
prod silently broken" regression.

## 3. Contract

### 3.1 Selector helper

`packages/api/src/lib/clientIp.ts` — promoted from `waitlist.ts`:

```ts
export function clientIp(c: Context<AppEnv>): string {
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('fly-client-ip') ??
    (c.req.header('x-forwarded-for') ?? '').split(',')[0]?.trim() ??
    'unknown'
  );
}
```

`waitlist.ts` re-uses this helper instead of redefining it.

### 3.2 Middleware additions

Extend `withRateLimit` to support a `keyBy` selector:

```ts
export interface RateLimitOptions {
  name: string;
  limit: number;
  windowMs: number;
  /** Defaults to 'user' (the existing behaviour). */
  keyBy?: 'user' | 'ip' | 'phone' | ((c: Context<AppEnv>) => string);
}
```

- `keyBy: 'user'` — current behaviour. Key: `${name}:user:${userId ?? 'anon'}`.
- `keyBy: 'ip'` — for unauthed routes. Key: `${name}:ip:${clientIp(c)}`.
- `keyBy: 'phone'` — reads `phone` from a Zod-validated body via a
  small `phoneOf(c)` helper that re-parses the body cheaply (Hono's
  `c.req.valid('json')` is cached by `@hono/zod-validator`, so this
  is free after the route's own validator ran).
- `keyBy: (c) => string` — escape hatch (composite keys, debug).

The `'anon'` user fallback existed for defence-in-depth but is now a
DoS vector if `keyBy: 'user'` is mounted before `withAuth()`. New
rule: **mounting `withRateLimit({ keyBy: 'user' })` without a prior
`withAuth()` is a boot-time error.** The middleware asserts
`c.get('userId')` is set; a missing userId throws a 500 in dev/test
and a 401 in prod (the latter is the right answer for a bug-shaped
caller anyway).

### 3.3 New budgets

> **Update (better-auth migration).** `POST /auth/otp/start`,
> `POST /auth/otp/verify`, and `POST /auth/password/verify` no longer
> exist as Hono routes. Email-OTP send/verify is owned by
> better-auth (`/api/auth/email-otp/send-verification-otp`,
> `/api/auth/sign-in/email-otp`) and password sign-in by
> `/api/auth/sign-in/email`; better-auth's built-in limiter keys
> by IP for those. The catch-all per-IP and per-user limits in this
> doc still apply on top.

Per-route budgets (additive to the existing AI route budgets):

| Route | keyBy | Limit | Window |
|---|---|---|---|
| `POST /api/auth/email-otp/send-verification-otp` | `email` | 3 | 15 min |
| `POST /api/auth/email-otp/send-verification-otp` | `ip` | 10 | 1 h |
| `POST /api/auth/sign-in/email-otp` | `email` | 10 | 15 min |
| `POST /api/auth/sign-in/email-otp` | `ip` | 30 | 1 h |
| `POST /api/auth/sign-in/email` | `email` | 10 | 1 min *(existing, refactored to middleware)* |
| `POST /waitlist` | `ip` | 5 | 1 h *(existing, refactored)* |
| `POST /waitlist` | `ip` | 50 | 1 d *(existing, refactored)* |
| `POST /waitlist/confirm` | `ip` | 30 | 1 h |
| **default (catch-all authed)** | `user` | 600 | 1 min |
| **default (catch-all unauthed)** | `ip` | 120 | 1 min |
| **shared AI** (`ai.user`) | `user` | 60 | 1 min |

The shared AI budget is implemented as a **second** middleware mounted
alongside each per-route AI limit. Both must pass; the per-route one
keeps voice-only abusers from monopolising the shared bucket.

The catch-all defaults are mounted **globally** in `createApp()` after
auth middleware resolves `userId` for the request — i.e. as an
`app.use('*', ...)`. Routes that opt out (e.g. `/healthz`, `/readyz`)
do so by appearing in a small static skip-list inside the global
middleware.

### 3.4 Backend: `PostgresRateLimiter`

Schema (new migration `NNNN_rate_limit_buckets.sql`):

```sql
CREATE TABLE app.rate_limit_buckets (
  bucket_key   text PRIMARY KEY,         -- '<name>:<keyBy>:<value>|<windowStartMs>'
  window_end   timestamptz NOT NULL,
  count        int  NOT NULL
);
CREATE INDEX rate_limit_buckets_window_end_idx
  ON app.rate_limit_buckets (window_end);
```

Consume query (one round-trip):

```sql
INSERT INTO app.rate_limit_buckets (bucket_key, window_end, count)
VALUES ($1, to_timestamp($2/1000.0), 1)
ON CONFLICT (bucket_key) DO UPDATE
  SET count = app.rate_limit_buckets.count + 1
RETURNING count, window_end;
```

GC: cron-style `DELETE FROM app.rate_limit_buckets WHERE window_end < now() - interval '1 hour'`
runs on an interval timer in the API process (every 10 min, jittered
per machine). One machine doing GC is fine; the others no-op via
`ON CONFLICT DO NOTHING` patterns where applicable.

This bucket table is **outside** the per-request scope wrapper — it
uses an admin namespace connection, same as `auth.sessions`. No RLS;
no per-user policies needed (the value `count` is never user-visible).

### 3.5 Backend selection (Pitfall 13)

`getRateLimiter()` picks the backend the same way `pickStorage()`
does — from the parsed `env` object, not `process.env`:

```ts
// lib/rateLimiter.ts
export function getRateLimiter(): RateLimiter {
  if (_instance) return _instance;
  if (env.NODE_ENV === 'production') {
    _instance = new PostgresRateLimiter(rawDb());
  } else if (env.RATE_LIMIT_BACKEND === 'postgres') {
    _instance = new PostgresRateLimiter(rawDb());
  } else {
    _instance = new MemoryRateLimiter();
  }
  return _instance;
}
```

New env var:

```ts
RATE_LIMIT_BACKEND: z.enum(['memory', 'postgres']).default('memory'),
```

Production deploys (Fly prod + dev) set `RATE_LIMIT_BACKEND=postgres`
in Doppler so the path is exercised on `dev` before reaching prod.

Lint guard `scripts/check-no-process-env-rate-limit.sh` mirrors the
existing R2 guard.

### 3.6 Response semantics

Unchanged from P1.9: 429 + `{error:{code:'rate_limited', message},
requestId}` + `Retry-After` + `X-RateLimit-{Limit,Remaining,Reset}`
headers. When multiple limiters reject the same request (e.g. shared
AI + per-route AI), the headers reflect the **shortest** reset
(soonest the client can retry) and the lower `Limit`. A small helper
`pickTightest(results)` makes this explicit.

### 3.7 Test inventory

Following [Pitfall 1](pitfalls.md#pitfall-1--p1-done-without-real-api-tests)
and the "test the default wiring" rule:

**Per-route unit tests** (`middleware/rateLimit.test.ts`, against
`MemoryRateLimiter`):

- Happy path: N requests, all 2xx, headers count down.
- Boundary: N+1 → 429 with `Retry-After`.
- Window reset: advance fake clock, N+1 again, 2xx.
- `keyBy` variants: user / ip / phone / fn isolate buckets correctly.
- `keyBy: 'user'` without prior `withAuth()` → 500 in dev, 401 in prod.
- Header tightness: two limiters reject → 429, headers show tightest.

**Default-wiring integration tests** (`__tests__/integration/rate-limit.postgres.test.ts`,
Testcontainers Postgres + the `PostgresRateLimiter` chosen by
`getRateLimiter()` without any DI override):

- `POST /auth/otp/start` 4× same phone in 15min → 4th is 429.
- `POST /auth/otp/start` 11× same IP in 1h with rotating phones → 11th is 429.
- `POST /voice/transcribe` + `POST /voice/summarize` interleaved
  against the same user → shared AI bucket trips at the 61st call.
- Two concurrent processes (simulated by two clients sharing a DB)
  consuming the same bucket → atomic count, no over-shoot. This is
  the test that catches the Pitfall-5 (multi-machine) regression.
- Catch-all per-user 600/min on `GET /me` — 601st 429.
- Catch-all per-IP 120/min on `GET /healthz` — 121st 429.
- `/readyz` and `/healthz` are in the skip-list → no limit.

**Scope-test pair** (Pitfall 6): rate-limit buckets are not RLS'd
because the table is in the admin namespace and not exposed via any
route. A negative test asserts the table is not readable through any
authed route (grep-based audit of the OpenAPI spec).

### 3.8 Mobile client behaviour

Out of scope for this design — covered as a separate task in
[plan-p4-hardening.md](plan-p4-hardening.md) §"429 handling". The
short version: `apps/mobile/lib/api/client.ts` already reads
`Retry-After` and surfaces a themed `AppDialogSheet` with a countdown
("Try again in 12s"). No `Alert.alert` (rule 4).

## 4. Pitfalls addressed

- **[Pitfall 1](pitfalls.md#pitfall-1--p1-done-without-real-api-tests)**
  — every new route/middleware ships its integration test in the
  same commit.
- **[Pitfall 13](pitfalls.md#pitfall-13--di-stubs-become-the-spec-default-wiring-silently-broken)**
  — production picks `PostgresRateLimiter` from parsed `env`, not
  `process.env`. Default wiring is covered by Testcontainers
  integration tests that DO NOT inject a stub limiter. A lint guard
  forbids `process.env.RATE_LIMIT_*` outside `env.ts`.
- **[Pitfall 6](pitfalls.md#pitfall-6--per-request-db-scope-rls-replacement-added-late)**
  — `app.rate_limit_buckets` lives in the admin namespace; no route
  exposes it; the bucket key is salted with `name` so collisions
  across limiters are impossible.
- **[Pitfall 15](pitfalls.md#pitfall-15--route-handlers-that-ignore-user-settings)**
  — N/A here (no per-user setting), but the `keyBy: 'phone'` selector
  reads the validated body explicitly rather than re-parsing
  headers, so the same "use the thing you loaded" pattern holds.

Process pitfall (Subagent over-scoping): commits stay one-thing-each
per the checklist below. The `PostgresRateLimiter` migration ships
in its own commit; the SMS-pumping routes follow; the catch-all
defaults are last so we can land them with the most context.

## 5. Implementation checklist (commit-by-commit)

> All commits target `dev` (default base). PR base = `dev`.

1. **`refactor(api): promote clientIp to lib/clientIp.ts`** — extract
   from `waitlist.ts`; add a 4-case unit test; re-import in waitlist.
2. **`feat(api): rateLimit middleware supports keyBy selector`** —
   extend `withRateLimit` (user / ip / phone / fn), guard misuse of
   `keyBy: 'user'` without prior `withAuth()`. Unit tests for each
   variant. No route changes yet.
3. **`feat(db): app.rate_limit_buckets table`** — migration +
   Drizzle schema entry + GC job skeleton (no callers yet).
4. **`feat(api): PostgresRateLimiter backend`** — implement the
   `RateLimiter` interface against the new table; Testcontainers
   integration test exercises atomic `consume` across two concurrent
   clients. `getRateLimiter()` reads `env.RATE_LIMIT_BACKEND` (new
   env var) and `env.NODE_ENV`. Lint guard for `process.env.RATE_LIMIT_*`.
5. **`feat(api): rate-limit /auth/otp/start and /auth/otp/verify`**
   — phone + IP limiters per §3.3. Integration tests asserting the
   429 behaviour and `Retry-After` header.
6. **`refactor(api): port /auth/password/verify and /waitlist to withRateLimit`**
   — replace the two ad-hoc inline calls to `getRateLimiter()` with
   `withRateLimit({ keyBy: ... })`. Tests stay green; no behaviour change.
7. **`feat(api): shared per-user AI budget (ai.user 60/min)`** —
   mount a second `withRateLimit` on every AI route; helper
   `aiUserShared()` returns the same instance so the bucket truly
   shares. Integration test interleaving transcribe + generate.
8. **`feat(api): global catch-all per-user/per-IP rate limit`** —
   mount in `createApp()` after auth resolves; skip-list for
   `/healthz` and `/readyz`. Tests cover the catch-all trip and the
   skip-list.
9. **`docs(arch): rewrite arch-api-design.md §Rate limiting to point at arch-rate-limiting.md`**
   — update the section, add the new doc to the architecture index,
   add a row to the doc table at the top of `architecture.md`.
10. **`chore(ops): set RATE_LIMIT_BACKEND=postgres in Doppler dev + prd`**
    — out-of-repo step; recorded in the PR description with the
    Doppler config diff. Verified by hitting `/auth/otp/start` 4×
    against `harpa-pro-api-dev` after the deploy lands.

Each commit is ≤ ~250 lines of diff and stands alone (the previous
commit's tests stay green without the next one). PR base is `dev`;
do not merge to `main` without explicit instruction (AGENTS.md rule 2).

## 6. Open questions / carve-outs

- **Upstash backend.** Not built here. Recorded as a follow-up in
  [plan-p4-hardening.md](plan-p4-hardening.md) §"UpstashRateLimiter
  (optional)" — add only if/when Upstash is introduced for something
  else (e.g. idempotency cache). The interface is ready.
- **Per-project rate limits.** Not in scope — no concrete abuse
  shape today. Carved out to [plan-p4-hardening.md](plan-p4-hardening.md)
  §"Per-project abuse limits" for re-evaluation after Beta.
- **Body-derived `keyBy: 'phone'` ergonomics.** This relies on the
  fact that `@hono/zod-openapi` caches `c.req.valid('json')`. If a
  future Hono upgrade breaks that contract, the helper falls back
  to an explicit second parse. Documented in
  `lib/clientIp.ts` (next to the `phoneOf` helper) so it is found
  on the first grep.
- **Mobile 429 handling polish.** Out of scope here; see
  [plan-p4-hardening.md](plan-p4-hardening.md) §"429 handling" for
  the screen + dialog work.
