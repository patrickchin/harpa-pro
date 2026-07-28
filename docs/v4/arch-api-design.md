# API design

> Companion: [`arch-auth-and-rls.md`](arch-auth-and-rls.md),
> [`arch-ai-fixtures.md`](arch-ai-fixtures.md),
> [`arch-storage.md`](arch-storage.md).
>
> Lessons applied: [Pitfall 1](pitfalls.md#pitfall-1--p1-done-without-real-api-tests),
> [Pitfall 4](pitfalls.md#pitfall-4--big-features-stubbed-then-forgotten),
> [Pitfall 7](pitfalls.md#pitfall-7--date--time-formatting-bugs-in-production).

## Stack

- **Hono** for routing.
- **Zod** for request/response validation; the same Zod schemas live
  in `packages/api-contract` and are re-exported to the mobile client.
- **Drizzle ORM** with the per-request scope wrapper (see
  [arch-auth-and-rls.md](arch-auth-and-rls.md)).
- **OpenAPI 3.1** spec generated from `@hono/zod-openapi` route
  definitions. `api-contract` runs `openapi-typescript` against it
  to produce `generated/types.ts` consumed by the mobile client.

## Endpoint inventory

Frozen at the start of P1. New endpoints require an architecture
update.

### Auth (`/api/auth/*`, public — handled by better-auth)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/email-otp/send-verification-otp` | Send email OTP via Resend |
| POST | `/api/auth/sign-in/email-otp` | Verify six-digit OTP and issue session |
| POST | `/api/auth/sign-in/email` | Test-account and demo-account password sign-in (allow-listed via `TEST_ACCOUNT_EMAILS` / `DEMO_ACCOUNT_EMAILS`) |
| POST | `/api/auth/sign-out` | Delete session |
| GET | `/me` | Current user profile |
| PATCH | `/me` | Update profile (name, company) |
| GET | `/me/usage` | Per-month report counts (for usage screen). Includes effective `plan` + `limits` array — see [arch-usage-limits.md](arch-usage-limits.md). |
| GET | `/me/limits` | Effective per-bucket caps + current usage. See [arch-usage-limits.md §5.4](arch-usage-limits.md). |

### Projects (`/projects`, authed)

| Method | Path | Purpose |
|---|---|---|
| GET | `/projects` | List projects user is member of |
| POST | `/projects` | Create project |
| GET | `/projects/:id` | Get project + stats |
| PATCH | `/projects/:id` | Update project |
| DELETE | `/projects/:id` | Owner-only |
| GET | `/projects/:id/members` | List members |
| POST | `/projects/:id/members` | Invite by email |
| DELETE | `/projects/:id/members/:userId` | Remove member |

### Reports (`/projects/:id/reports`, authed)

| Method | Path | Purpose |
|---|---|---|
| GET | `/projects/:id/reports` | List |
| POST | `/projects/:id/reports` | Create draft |
| GET | `/reports/:reportId` | Get with notes |
| PATCH | `/reports/:reportId` | Update fields |
| DELETE | `/reports/:reportId` | Delete |
| POST | `/reports/:reportId/generate` | LLM generate report from notes |
| POST | `/reports/:reportId/finalize` | Finalize (frozen) |
| POST | `/reports/:reportId/regenerate` | Regenerate report body |
| POST | `/reports/:reportId/pdf` | Render PDF (returns signed URL) |
| GET | `/projects/:id/reports/:number/comments` | List finalized-report review comments |
| POST | `/projects/:id/reports/:number/comments` | Add a finalized-report review comment |

### Notes (`/reports/:reportId/notes`, authed)

| Method | Path | Purpose |
|---|---|---|
| GET | `/reports/:reportId/notes` | Timeline |
| POST | `/reports/:reportId/notes` | Create text/voice/image note |
| PATCH | `/notes/:noteId` | Edit text body |
| DELETE | `/notes/:noteId` | Delete |

### Files (`/files`, authed)

| Method | Path | Purpose |
|---|---|---|
| POST | `/files/presign` | Mint R2 signed PUT |
| POST | `/files` | Register uploaded file (after PUT) |
| GET | `/files/:id/url` | Signed GET URL |

### Voice (`/voice`, authed)

| Method | Path | Purpose |
|---|---|---|
| POST | `/voice/transcribe` | Transcribe (file id → transcript) |
| POST | `/voice/summarize` | Summarise transcript → note body |

### Settings (`/settings`, authed)

| Method | Path | Purpose |
|---|---|---|
| GET | `/settings/ai` | Per-user AI provider preference |
| PATCH | `/settings/ai` | Update |

### Admin (`/admin`, authed + `auth.users.is_admin = true`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/waitlist.csv` | Export waitlist (marketing P1). |
| PATCH | `/admin/users/:id/plan` | Change a user's plan tier. See [arch-usage-limits.md](arch-usage-limits.md). |
| PUT | `/admin/users/:id/limit-overrides` | Upsert per-bucket override. See [arch-usage-limits.md](arch-usage-limits.md). |
| DELETE | `/admin/users/:id/limit-overrides` | Drop the override row. |

## Conventions

### Path identifiers

From P3.0 onwards, path params use **prefixed slugs**
(`prj_xxxxxx`, `rpt_xxxxxx`) instead of UUIDs. Reports also
expose a per-project number for human-readable canonical URLs
(`/projects/prj_xxxxxx/reports/42`). Two short-link routes
(`/p/:projectSlug`, `/r/:reportSlug`) `308` to the canonical
long URL. Full design in [arch-ids-and-urls.md](arch-ids-and-urls.md).
The `:id` / `:reportId` paths in the route tables above are the
pre-P3.0 shape and will be renamed by the P3.0 migration.

### Request / response shape

- All bodies are JSON.
- All timestamps serialised as **ISO-8601 strings** via a shared
  Zod transform. No raw PG textual timestamps. (Pitfall 7.)
- All UUIDs serialised as RFC-4122 strings. (Pitfall 11.)
- Pagination: cursor-based, `?cursor=<opaque>&limit=<n>`. Response
  envelope: `{ items, nextCursor }`. No offset/limit anywhere.
- Errors: `{ error: { code, message, details? } }`, HTTP status
  matches semantically. `code` is a stable string enum
  (`AUTH_INVALID_TOKEN`, `RATE_LIMITED`, `VALIDATION_FAILED`, …).

### Auth header

`Authorization: Bearer <jwt>` only. No cookie auth.

### Rate limiting

Full design in [arch-rate-limiting.md](arch-rate-limiting.md). In
brief: `RateLimiter` abstraction with a `PostgresRateLimiter` backend
in production (atomic counts across Fly machines) and a
`MemoryRateLimiter` in dev/test. Three layers:

- **Per-route budgets** declared on each route via `withRateLimit`
  (keyed by user / ip / email — see the table in arch-rate-limiting.md).
- **Shared per-user AI budget** of 60 RPM across `voice.*` and
  `reports.generate`.
- **Catch-all defaults** mounted globally: 600/min per user on authed
  traffic, 120/min per IP on unauthed traffic. `/healthz` and
  `/readyz` opt out via a static skip-list.

Email-OTP abuse protection on `POST /api/auth/email-otp/send-verification-otp`
and `POST /api/auth/sign-in/email-otp` (per-email + per-IP) is enforced
by better-auth's built-in rate limiter; clients receive a 429 +
`Retry-After` + `X-RateLimit-*` headers. Demo account password sign-in
uses better-auth's email/password endpoint and does not alter the OTP
route.

### Idempotency

- `POST /reports/.../{generate,regenerate}`, `POST /voice/transcribe`,
  and `POST /reports/.../notes/voice` accept an `Idempotency-Key`.
- Identity is scoped to route name, user, HTTP method, concrete path,
  request-body SHA-256, and the client key. Reusing the same client key
  for a different method, resource, or body starts an independent
  operation; it never replays another request's response.
- Production uses `app.idempotency_keys` (migration
  `0021_idempotency_keys.sql`). One machine owns a renewable 30-second
  lease while the handler runs; concurrent machines wait and replay the
  completed response. Completed responses live for 24 hours. A 5xx or
  thrown handler releases the claim so a later retry can run.
- Dev and tests use `MemoryIdempotencyStore`, which applies the same
  replay and in-flight coalescing semantics inside one process.
- The mobile report client keeps one key and its original
  generate/regenerate operation across ambiguous transport, 5xx, and
  response-parse failures. It retires the key after a matching success
  or definitive 4xx response. The CLI continues to send only an
  explicitly supplied key.

This prevents live concurrent duplicates across Fly machines. It is
not an exactly-once job system: if a machine dies after an external AI
provider accepted work but before the completed response is persisted,
the expired lease can be reclaimed and the operation may run again.
Routes that require protection from that crash window must move the
side effect behind a durable asynchronous job/outbox.

### OpenAPI strategy

- Routes declared with `@hono/zod-openapi` so the spec is generated
  from the same Zod schemas the runtime validates with.
- `pnpm spec:emit` writes `packages/api-contract/openapi.json`.
- `pnpm spec:gen` runs `openapi-typescript` to produce
  `packages/api-contract/src/generated/types.ts`.
- A CI job (`p1-exit-gate`) runs both and `git diff --exit-code` —
  the spec must be in sync with the code.

### Error format consistency

A shared error mapper in `packages/api/src/lib/errors.ts` converts:

- Zod errors → 400 `VALIDATION_FAILED` with field-level `details`.
- `HTTPException` → its mapped code/message.
- `db unique violation` → 409 `CONFLICT`.
- Anything else → 500 `INTERNAL` with a request id, full stack
  in Sentry breadcrumbs only.

A property-based test (`fast-check`) runs the mapper against random
inputs to guarantee the response always matches the error envelope.

## Test inventory (P1 exit gate)

For each route:

1. **Validation tests** (Vitest) — happy + 3 invalid payloads.
2. **Integration tests** (Testcontainers Postgres) —
   covers happy path with two actors, both per-request scope tests
   (own + cross), the contract test (response matches OpenAPI).
3. **Idempotency test** for routes that declare it.
4. **Rate-limit test** for routes that declare it.
5. **Fixture test** for AI-touching routes — replay a recorded
   fixture, assert the route response matches a snapshot.

Coverage target: ≥ 90% line on `packages/api/src/`. CI publishes
the coverage delta on every PR.
