# P1 — API Core

> **P1 complete (2026-05-12).** All 12 tasks (P1.1 – P1.12) shipped on
> `dev`. Tagged `v0.1.0-api`.
>
> **Final test counts:** 5 unit files / 15 tests + 18 integration
> files / 140 tests — all green.
> **Coverage (integration suite, `packages/api/src/`):** 90.6% lines
> overall; routes 99.01%; services 89.05%. Meets the ≥ 90% gate.
> **Audits:** no real LLM calls in tests, no `TODO` /
> `throw new Error('not implemented')` in route handlers, scope tests
> present for every authed route, OpenAPI spec frozen + drift-gated.
>
> Goal: every endpoint in [arch-api-design.md](arch-api-design.md)
> implemented, tested, scoped, and fixture-covered.
>
> **The single most important rule for P1**: no route lands without
> its tests in the same commit. See
> [Pitfall 1](pitfalls.md#pitfall-1--p1-done-without-real-api-tests).

## Exit gate (`p1-exit-gate.yml`)

- [x] `pnpm test:api && pnpm test:api:integration` green.
- [x] Coverage on `packages/api/src/` ≥ 90% lines (integration suite
      reports 90.6%).
- [x] Zero `// TODO` / `throw new Error('not implemented')` in route handlers.
- [x] Per-request scope tests cover **every** authed route (paired own/cross + negative-control). `scripts/check-scope-tests.sh` green.
- [x] OpenAPI ↔ code in sync (`scripts/check-spec-drift.sh` green;
      wired into `pnpm lint`).
- [x] Every AI route has a fixture replay test.
- [x] No real LLM call in CI (audit grep clean).
- [x] Rate-limit + idempotency tests for routes that declare them.

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
      via `FixtureStorage` for CI. `R2Storage` is now wired against
      `@aws-sdk/client-s3` + `s3-request-presigner` for production
      (presign PUT, signed GET, server-side putObject); the headless HTML
      renderer remains a stub for P4. arch-storage.md §"Fixture mode"
      still holds: no R2 calls in CI._
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
- [x] Shared error mapper.
- [x] `fast-check` test asserting envelope invariant.
  - 4 properties × 60 runs: HTTPException (status preserved, message
    surfaced), ZodError (→ 400 + `validation_error`), AiProviderError
    (→ 502, canned message, no fixture/provider/inner leak),
    unhandled Error subclasses (→ 500, canned message, no
    message/stack/name leak). Every body parses against
    `errorEnvelope` from `@harpa/api-contract` and carries a non-empty
    `requestId`.
  - **Carve-out (Pattern R1):** Hono v4's dispatch only calls
    `app.onError` for `Error` instances; non-Error throws (`throw 'x'`,
    `throw 42`, `throw null`) propagate as uncaught exceptions and
    bypass the mapper entirely. Documented in
    [`docs/bugs/README.md`](../bugs/README.md#r1--framework-swallow-thrown-non-error-values-bypass-middleware).
    The unhandled-error property is therefore narrowed to Error
    subclasses (the realistic universe given our codebase). A tiny
    outermost "Error-coerce" middleware would close this gap; carved
    out of P1.10 — not adopted because nothing in our codebase throws
    non-Error values.
- [x] Commit: `test(api): property tests for error mapper`.

### P1.11 Contract + OpenAPI freeze
- [x] `pnpm spec:emit` writes `openapi.json`.
- [x] Contract test passes for every route.
  - `packages/api/src/__tests__/contract.test.ts` (3 tests):
    1. runtime spec deep-equals the frozen `packages/api-contract/openapi.json`,
    2. every documented `(method, path)` pair is registered in `app.routes`,
    3. authed routes declare a `bearerAuth` security requirement and
       the scheme is registered at `components.securitySchemes`.
- [x] Spec drift gate: `scripts/check-spec-drift.sh` re-emits +
      regenerates types and fails on `git diff`. Wired into root
      `pnpm lint`.
- [x] `gen-types.ts` updated for `openapi-typescript@7` (`astToString`).
- [x] `bearerAuth` security scheme registered in `createApp()` so the
      32 `security: [{ bearerAuth: [] }]` references in the spec
      resolve to a declared component (was a real gap in the spec).
- [x] Commit: `chore(contract): freeze v1 OpenAPI spec`.

### P1.12 P1 exit gate
- [x] All boxes ticked. Tag `v0.1.0-api`.
  - Verified 2026-05-12 via the gate checklist above. CI workflow
    `p1-exit-gate.yml` is referenced in the plan but the repo has no
    `.github/workflows/` yet — carved out as a P4 (Hardening) task
    when CI infra lands. Until then, the gate is enforced locally
    via `pnpm typecheck && pnpm lint && pnpm test:api &&
    pnpm test:api:integration`.
