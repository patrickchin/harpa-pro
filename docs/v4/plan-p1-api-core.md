# P1 — API Core

> Goal: every endpoint in [arch-api-design.md](arch-api-design.md)
> implemented, tested, scoped, and fixture-covered.
>
> **The single most important rule for P1**: no route lands without
> its tests in the same commit. See
> [Pitfall 1](pitfalls.md#pitfall-1--p1-done-without-real-api-tests).

## Exit gate (`p1-exit-gate.yml`)

- [ ] `pnpm test:api && pnpm test:api:integration` green.
- [ ] Coverage on `packages/api/src/` ≥ 90% lines.
- [ ] Zero `// TODO` / `throw new Error('not implemented')` in route handlers.
- [ ] Per-request scope tests cover **every** authed route (paired own/cross + negative-control). `scripts/check-scope-tests.sh` green.
- [ ] OpenAPI ↔ code in sync (`pnpm spec:emit && pnpm gen:types && git diff --exit-code`).
- [ ] Every AI route has a fixture replay test.
- [ ] No real LLM call in CI (audit grep).
- [ ] Rate-limit + idempotency tests for routes that declare them.

## Tasks

Each task = one route file + its tests + its api-contract schemas
+ docs update, in a single commit.

### P1.1 Auth + me
- [ ] `auth/otp/start`, `auth/otp/verify`, `auth/logout`.
- [ ] `GET /me`, `PATCH /me`, `GET /me/usage`.
- [ ] Auth middleware + scoped DB accessor.
- [ ] Commit: `feat(api): auth routes + auth middleware with scope accessor`.

### P1.2 Projects
- [ ] CRUD + members.
- [ ] Owner-only delete enforced server-side.
- [ ] Commit: `feat(api): projects + members routes with scope tests`.

### P1.3 Reports CRUD
- [ ] List, create, get, patch, delete.
- [ ] Commit: `feat(api): reports CRUD with scope tests`.

### P1.4 Notes
- [ ] Timeline + create/edit/delete.
- [ ] Commit: `feat(api): notes routes with scope tests`.

### P1.5 Files
- [x] `presign`, `register`, `url`. R2 SDK wired with fixture mode.
- [x] Server-built object keys (`users/<id>/...`).
- [x] Commit: `feat(api): files + R2 signed URL minting`. (landed as `feat(api): files presign + register + signed-GET URL via storage abstraction`, commit `7f01870`)

### P1.6 Voice (AI)
- [x] `POST /voice/transcribe` (Whisper via ai-fixtures).
- [x] `POST /voice/summarize` (LLM via ai-fixtures).
- [x] Recorded fixtures: `transcribe.basic`, `summarize.basic`.
- [x] Commit: `feat(api): voice transcribe + summarize via ai-fixtures`.

### P1.7 Reports (AI)
- [x] `POST /reports/:id/generate` (LLM).
- [x] `POST /reports/:id/regenerate`.
- [x] `POST /reports/:id/finalize`.
- [x] `POST /reports/:id/pdf` (renders HTML→PDF, stores to R2, returns signed URL).
      _PDF rendering runs through a deterministic stub renderer
      (`services/report-pdf.ts`) and `Storage.putObject` — wired end-to-end
      via `FixtureStorage` for CI. Real R2 upload + headless renderer
      remain stubs (`R2Storage.putObject`/`signGet`/`presign` throw); they
      land alongside live-mode infra in P1 follow-up. arch-storage.md
      §"Fixture mode" still holds: no R2 calls in CI._
- [x] Recorded fixtures: `generate-report.full`, `generate-report.incomplete`.
- [x] Commit: `feat(api): report generation + finalize + PDF rendering`.

### P1.8 Settings
- [x] `GET/PATCH /settings/ai`.
- [x] Commit: `feat(api): per-user AI provider settings`.

### P1.9 Rate limiting + idempotency
- [x] `@upstash/ratelimit` middleware with per-route budgets.
  - **Carve-out:** shipped a small in-house `RateLimiter` interface with a
    `MemoryRateLimiter` default (per-process, per-machine). Same shape and
    response semantics as `@upstash/ratelimit` (X-RateLimit-* headers,
    429 + Retry-After). Multi-machine production deploys will swap in an
    `UpstashRateLimiter` implementing the same interface — no caller
    change needed. Avoids requiring a real Upstash/Redis in CI.
- [x] Idempotency-Key middleware for generate + transcribe.
  - 24h TTL, per-(route, userId, key), `Idempotent-Replay: true` header
    on cache hit, never caches 5xx. Same in-house abstraction with a
    `MemoryIdempotencyStore` default and the same Upstash carve-out.
- [x] Tests covering both.
- [x] Commit: `feat(api): rate limiting + idempotency middleware`.

### P1.10 Error mapper + property tests
- [ ] Shared error mapper.
- [ ] `fast-check` test asserting envelope invariant.
- [ ] Commit: `test(api): property tests for error mapper`.

### P1.11 Contract + OpenAPI freeze
- [ ] `pnpm spec:emit` writes `openapi.json`.
- [ ] Contract test passes for every route.
- [ ] Commit: `chore(contract): freeze v1 OpenAPI spec`.

### P1.12 P1 exit gate
- [ ] All boxes ticked. Tag `v0.1.0-api`.
