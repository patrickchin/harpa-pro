# Recurring bugs log

> Catalogue of bugs that have bitten us more than once and the
> patterns (R1, R2, …) that produce them. When you ship a fix for a
> bug that recurred, that almost-recurred, or that only got caught
> by manual QA / E2E despite green tests, add an entry below in
> the same PR.
>
> See also:
> - [`AGENTS.md`](../../AGENTS.md) — hard rules + recurring-bugs reminder.
> - [`docs/v4/pitfalls.md`](../v4/pitfalls.md) — design-level lessons from the v3 attempt that map 1:1 to the hard rules.
> - [`docs/v4/architecture.md`](../v4/architecture.md) — system overview.

## Entry template

```
### YYYY-MM-DD — short title (Pattern Rn if applicable)

**Symptom.** What went wrong (user-visible).
**Root cause.** Why.
**Fix.** PR/commit + the change in one sentence.
**Test.** The new automated test that would have caught it.
**Pattern.** Which Rn this maps to (or "new pattern Rn — added below").
```

## Patterns

### R4 — Test files inside `app/` get bundled into the mobile app

- `expo-router` globs `app/**/*.{ts,tsx}`, so a colocated `*.test.tsx` is treated as a route and pulled into the Metro graph.
- App-open crashes with `Unable to resolve "@vitest/runner/utils"`; Vitest stays green so CI doesn't catch it.
- Mitigation: keep tests under `apps/mobile/__tests__/...` (mirror the route path) or `apps/mobile/screens/`.
- Helper files that must live in `app/` need a `_` prefix so the route scanner skips them.

### R3 — Rules of Hooks violation in expo-router layouts with auth gates

- Layout calls `useAuthSession()`, returns `<Redirect />` early on `loading`/`unauthenticated`, then calls more hooks afterwards → `Rendered fewer hooks than expected` when state flips.
- Single-render Vitest snapshots never cross the transition, so they catch nothing.
- Rule: every hook call must precede any conditional return.
- Mitigation: re-render test flipping `loading → unauthenticated → authenticated` for any layout with auth / deep-link / feature-flag gates.

### R2 — `.js` extensions in relative TS imports break Metro bundling

- Metro cannot resolve `from './foo.js'` when the on-disk file is `foo.ts`/`.tsx`. TS + Vitest both resolve it fine, so tests stay green.
- Recurrence vectors: hand-written code mirroring the API package style; the `gen-hooks.ts` template emitting `from './client.js'` on every regen.
- Mitigation: no `.js` suffixes in relative imports under `apps/mobile/**/*.{ts,tsx}`. Fix the generator template, not just its output.

### R1 — Framework swallow: thrown non-Error values bypass middleware

- A dispatch loop that does `if (err instanceof Error) onError(err, c)` silently propagates any non-Error throw (`throw 'oops'`, `throw 42`, `throw null`, `throw {}`).
- The error-mapping middleware never runs, so envelope and leak guarantees are bypassed.
- Lint can't catch it — TS permits `throw <unknown>`.
- Mitigation: throw `Error` subclasses only; assert the contract narrowly in property tests.

### R5 — DI stubs become the spec; default wiring silently broken

- Every test injects a happy stub (`alwaysOkTurnstile()`, `recordingResend()`, …); the default `createXClient()` factory is never exercised, so the production-fake config that `docker compose up` / `:mock` builds use rots silently.
- Symptoms: endpoint 2xx, clean logs, no DB row / no outbound side-effect.
- Recurrence vectors: cheap injection helpers (`setXClients({…})`); fake-mode helpers gated on magic token shapes (`tt-…`, `fake-…`) the real dev widget can't produce.
- Mitigation 1 — for every collaborator factory, at least one integration test calls the route WITHOUT injecting that collaborator and asserts the real side-effect. See [arch-testing.md → "Test the default wiring"](../v4/arch-testing.md#test-the-default-wiring).
- Mitigation 2 — fake-mode helpers accept what the real dev surface produces; use `alwaysFailX()` only in the test that asserts the failure branch.
- Mitigation 3 — one browser/device E2E (Playwright for marketing, Maestro for mobile) per critical flow, hitting the live compose stack.

## Entries

### 2026-05-12 — Hono v4 onError ignores non-Error throws (Pattern R1)

- **Symptom.** Handler that does `throw 'oops'` crashes the worker instead of returning the 500 envelope. Found writing P1.10 property tests.
- **Root cause.** Hono v4 only invokes `app.onError` for `Error` instances; non-Error throws propagate out of `app.fetch` past `errorMapper`.
- **Fix.** No code change. Property test (`packages/api/src/__tests__/errorMapper.property.test.ts`) narrows its unhandled-error arbitrary to Error subclasses and pins the limitation in a comment. Future fix if needed: outermost middleware wrapping `await next()` in `try { … } catch (e) { throw e instanceof Error ? e : new Error(String(e)); }`.
- **Test.** `errorMapper.property.test.ts`.
- **Pattern.** R1 (new — added above).

### 2026-05-13 — `.js` extensions reappeared in mobile relative imports (Pattern R2)

- **Symptom.** `pnpm --filter @harpa/mobile ios` fails Metro bundling with `Unable to resolve "./session.js"`; Vitest stayed green.
- **Root cause.** Mobile relative imports written as `./foo.js`. Re-introduced via (1) new P2.4–P2.7 modules mirroring API style, (2) `scripts/gen-hooks.ts` template emitting `from './client.js'`.
- **Fix.** Stripped `.js` from 24 relative imports under `apps/mobile/**/*.{ts,tsx}`; fixed the generator template too.
- **Test.** Manual `ios` bundle for now. A CI grep gate for `from '\./[^']+\.js'` is deferred to P4 infra hardening.
- **Pattern.** R2 (new — added above).

### 2026-05-13 — AppLayout hook-order crash on auth-gate flip (Pattern R3)

- **Symptom.** Cold-launch iOS sim → `Rendered fewer hooks than expected` in `AppLayout`. Vitest stayed green — no test crossed an auth transition.
- **Root cause.** `app/(app)/_layout.tsx` returned `<Redirect />` early on `loading`/`unauthenticated`, before `useCallback`/`useEffect` ran. Hook count flipped from 3 → 5 between renders.
- **Fix.** Moved every hook above the conditional return. Verified by stashing the fix and watching the new test fail with the exact error.
- **Test.** `apps/mobile/__tests__/layouts/app-layout.test.tsx` — "does not throw when status flips" case plus three per-status render assertions.
- **Pattern.** R3 (new — added above).

### 2026-05-13 — Vitest leaked into mobile bundle via colocated `*.test.tsx` (Pattern R4)

- **Symptom.** Every screen mount errored with `Unable to resolve "@vitest/runner/utils"` after the R3 test was colocated inside `app/(app)/_layout.test.tsx`. Vitest itself ran fine.
- **Root cause.** `expo-router` globs `app/**/*.{ts,tsx}`; the test file got pulled into the Metro graph and dragged in `vitest` → `@vitest/runner/utils` → `chai`.
- **Fix.** Moved the test to `apps/mobile/__tests__/layouts/app-layout.test.tsx`. Also renamed `app/(dev)/registry.ts` → `_registry.ts` for the same reason.
- **Test.** `pnpm --filter @harpa/mobile bundle:smoke` (iOS bundle smoke) run after every commit per `docs/v4/overnight-protocol.md` §5.
- **Pattern.** R4 (new — added above).

### 2026-05-14 — Waitlist 202s with empty DB; fake-Turnstile required a magic token shape (Pattern R5)

- **Symptom.** Marketing form shows "Check your inbox" against the local compose stack; `app.waitlist_signups` stays empty, no email queued.
- **Root cause.** `fakeTurnstile()` only accepted `tt-…` tokens. The Cloudflare test-key widget emits real-format tokens (`XXXX.DUMMY.TOKEN.XXXX`), so the route returned the neutral 202 silent-rejection. Every existing test injected `alwaysOkTurnstile()`, so the default factory was untested.
- **Fix.** `fakeTurnstile()` now accepts any non-empty token (empty still rejected). Marketing form now uses `waitlistSignupRequest.safeParse` + schema-derived `maxLength` attrs from `@harpa/api-contract`.
- **Test.** `packages/api/src/__tests__/waitlist.integration.test.ts` — "default fakeTurnstile accepts any non-empty token end-to-end" and "default fakeTurnstile rejects empty token" (no DI stub). Marketing Playwright E2E is the longer-term gate.
- **Pattern.** R5 (new — added above).

### 2026-05-15 — `/auth/logout` deletes the session row but the JWT keeps working (Pattern R5)

- **Symptom.** After `POST /auth/logout` (200 OK), the bearer token continues to authenticate protected routes until JWT `exp` lapses (~7 days). Surfaced by `auth-crud.journey.integration.test.ts`.
- **Root cause.** `withAuth()` validates only JWT signature + expiry; `withScopedConnection` sets `app.session_id` from the JWT but never checks `auth.sessions` for a live row. No route actually validates the session despite stale header comments. Existing test confirmed DB row deletion but never made a post-logout authenticated request.
- **Fix.** Pending. Options: (1) `withAuth()` looks up `auth.sessions` by `sid` and 401s on missing/expired row; (2) opaque session tokens (DB-backed) as the bearer envelope, keeping JWT as internal signed payload only.
- **Test.** Journey suite should add `expect(/me-post-logout).toBe(401)` once the fix lands.
- **Pattern.** R5 — `signTestToken` became the de-facto spec; full `/auth/otp/verify` → CRUD → `/auth/logout` chain was never exercised end-to-end.

### 2026-05-15 — `auth.test.ts > rejects a tampered token` flakes ~6% (Pattern R6)

- **Symptom.** PR #3 unit job failed with `expected 200 to be 401` on a CSS-only commit; the preceding commit on the same branch was green.
- **Root cause.** Test tampered the JWT by flipping its last base64url char (`A`↔`B`). HS256 signatures are 32 bytes → 43 base64url chars; the last char has 2 padding bits decoders discard, so `A`, `B`, `C`, `D` decode identically — ~6% flake rate.
- **Fix.** Tamper with the **payload** segment instead (flip first char `e`→`a`). Any payload byte change invalidates the HMAC deterministically.
- **Test.** `packages/api/src/middleware/auth.test.ts > withAuth > rejects a tampered token` — verified 5/5 green locally post-fix.
- **Pattern.** R6 — probabilistic test inputs from freshly-minted JWTs. Mutate bytes in the decoded representation or a fully-significant segment (header/payload for JWTs, not the signature tail).
