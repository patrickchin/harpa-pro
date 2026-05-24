---
applyTo: "packages/api/**"
description: "API-specific rules for the Hono REST API. Loads automatically when editing packages/api/."
---

# API (packages/api)

## Architecture references

- `docs/v4/arch-api-design.md` — route layout, error shape, OpenAPI.
- `docs/v4/arch-auth-and-rls.md` — per-request scoped Postgres role.
- `docs/v4/arch-database.md` — Drizzle schema + migration rules.
- `docs/v4/arch-storage.md` — R2 presigned-URL flow.

## Per-request DB scope (RLS-equivalent)

- Every authenticated route opens a transaction and runs
  `SET LOCAL` from JWT claims **before** touching tables.
- Every new authenticated route needs a **scope-test pair**
  (positive + negative caller) — see Pitfall 6 in
  `docs/v4/pitfalls.md`.

## Default-wiring rule (Pitfall 13)

- Every collaborator factory (`createTurnstileClient`,
  `createR2Client`, `createTwilioClient`, AI provider clients, …)
  needs **at least one integration test that exercises the route
  without stubbing the factory**, asserting the real side-effect
  (HTTP call, signed URL shape, Twilio Verify payload).
- DI stubs are for negative-path branches only. Default wiring is
  the spec.

## Schema + migrations

- Drizzle migrations under `packages/api/migrations/`.
- Expand-then-contract for column renames / drops. Never destructive
  in a single deploy.
- Slugs + UUIDv7 — see `docs/v4/arch-database.md`.

## AI calls

- All AI provider calls route through `packages/ai-fixtures` for
  record / replay. Every new prompt template needs at least one
  fixture row (Pitfall 2).

## Uploads

- Upload completion **must** create a timeline-note row (Pitfall 8).
- API mints signed R2 URLs; mobile uploads direct to R2.

## Dates

- ISO-8601 across the wire. Parse + format via `lib/date.ts`
  (Pitfall 7) — no raw `new Date(string)` in route handlers.

## Test commands

```
pnpm --filter @harpa/api test
pnpm --filter @harpa/api test:integration   # Testcontainers
pnpm --filter @harpa/api typecheck
pnpm --filter @harpa/api lint
```

## Coverage gate

- 90%+ line coverage on `packages/api`.
