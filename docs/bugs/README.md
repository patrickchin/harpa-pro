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

### R7 — Health check is a static literal, not a readiness probe

A `/healthz` route that returns `{ok:true}` from a hard-coded
literal (no DB query, no schema check) tells Fly / a load balancer
that the **process is alive** — but says nothing about whether the
process can actually serve real traffic. If migrations haven't run
against the connected database, every DB-backed route 500s while
the health check stays green and Fly happily routes users to the
broken machine.

Mitigation: split liveness from readiness. `/healthz` may stay
cheap (process alive), but the endpoint Fly's HTTP check targets
must open a real DB connection AND verify the schema matches what
the running code expects (e.g. compare `app._migrations` head to a
build-time `MIGRATIONS_REQUIRED_HEAD`). Return 503 on any mismatch
so the LB takes the machine out of rotation and Fly's auto-rollback
engages. See `docs/v4/arch-cicd-and-migrations.md`.

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

### 2026-05-20 — prod returned 200 on /healthz while every DB route 500'd (Pattern R7)

**Symptom.** Fly machine `harpa-pro-api` v11 was `started`, 1/1
health checks passing, image deployed cleanly. But every endpoint
that touched the DB returned `500 { code: "internal_error" }`.
Postgres logs showed `42P01 relation "app.waitlist_signups" does
not exist` for `POST /waitlist`, `relation "auth.verifications"
does not exist` for `POST /auth/otp/start`, etc.

**Root cause.** Two independent failures:
1. The Neon prod branch had never had a migration applied.
   `api-prod.yml` only ran `flyctl deploy`; there was no
   migration step on the prod path. (`pr-preview.yml` runs
   `pnpm db:migrate` against the ephemeral PR Neon branch; that
   workflow is the *only* place migrations had ever run before
   this incident.)
2. `/healthz` was a static literal — `c.json({ok:true,...})` with
   no DB query — so Fly's HTTP check was green regardless of
   whether the DB schema was usable.

**Fix.** `docs/v4/arch-cicd-and-migrations.md` design + the
follow-up implementation:
- Fly `release_command` runs `pnpm --filter @harpa/api db:migrate`
  in a release machine; Fly only promotes the new image to app
  machines if it exits 0.
- New `/readyz` opens a real DB connection AND compares
  `app._migrations` head to a build-time
  `MIGRATIONS_REQUIRED_HEAD`. Fly's HTTP check now targets
  `/readyz`. `/healthz` stays as liveness.
- Migrator hardened: `pg_advisory_lock` serialises concurrent
  runs, per-file `BEGIN/COMMIT`, fail-loud logging.
- New `guard` job in `api-prod.yml` lints migration filenames at
  PR time; post-deploy step curls `/readyz` so a green workflow
  proves real traffic was served.

**Test.** Three Testcontainers integration tests under
`packages/api/src/__tests__/`:
- `readyz.integration.test.ts` — 503 schema-missing before
  migrate; 200 after; 503 head-mismatch with a bad
  `MIGRATIONS_REQUIRED_HEAD`; 503 db-down when pool is gone.
- `migrate.advisory-lock.integration.test.ts` — two concurrent
  `migrate()` calls produce exactly one set of `app._migrations`
  rows with no duplicate-key error.
- `migrate.failing-file.integration.test.ts` — a fixture dir with
  a bad SQL in file #3 rolls back the file's tx, leaves files
  #1+#2 committed, and stops the loop before file #4.

**Pattern.** R7 — Health check is a static literal, not a
readiness probe (added above).

### 2026-05-17 — invite-member form auto-closes on submit, hiding the API error (Pattern R5)

**Symptom.** A failed `POST /projects/:slug/members` invite (e.g.
the invited phone has no account → 404 "User not found.") looked
identical to a successful one from the user's perspective: the
invite form collapsed back to the "Add member" CTA with no error
notice visible. The Members list stayed empty and the user had no
clue why. First caught by `core-end-to-end.yaml` Maestro flow,
which expected the invited user to show up under "Editor" filter.

**Root cause.** `screens/project-members.tsx` had:

```tsx
onAdd={(input) => {
  onAddMember(input);
  if (!addError) setShowAdd(false);
}}
```

`onAddMember` triggers a TanStack mutation (async). `addError` is
read from the *current* render's props — which is `null` because
the mutation hasn't completed yet. So the form unconditionally
closes on submit, hiding the error notice that arrives on the
next render. Classic stale-state-in-an-event-handler bug.

**Fix.** Drive the close from the *route*, not from inside the
form. The mutation hook's `onSuccess` increments an
`addSuccessNonce` counter passed to the screen; an effect there
closes the form when the nonce changes. On failure, `nonce` does
not change, the form stays open, and the error notice renders
normally. Same PR adds two regression tests in
`screens/project-members.test.tsx`: one for the form-stays-open
path on error, one for the form-closes path on success.

**Test.** `screens/project-members.test.tsx` —
"keeps invite form open when the mutation fails (error stays visible)"
and "closes invite form when addSuccessNonce increments (success)".
Plus the Maestro `core-end-to-end.yaml` flow that originally
exposed the bug.

**Pattern.** R5 (default wiring broken, only DI-stubbed tests
pass). The existing screen-level test asserted the form's
behaviour with `addError={null}` and never combined it with a
post-submit close, so the synchronous stale read sailed through.

### 2026-05-17 — `btn-edit-manually` switched tabs but didn't seed the empty report (Pattern R5)

**Symptom.** Tapping "Edit manually" from the Report tab's
empty-state navigated to the Edit tab but the Edit tab still
showed *its* empty-state ("Generate a report first to edit"). The
user could not enter section data manually — which is the whole
point of the button. First caught by `core-end-to-end.yaml`
asserting `edit-section-meta` after tapping `btn-edit-manually`.

**Root cause.** `GenerateReportProvider.editManually` falls back
to `onSetReport(createEmptyReport())` only when the route wired
`onSetReport`. The real `generate.tsx` route owned a local
`setGeneratedReport` setter but never passed it as
`onSetReport={…}` to `<GenerateNotes>`. So the provider's
fallback short-circuited to a no-op and only `setActiveTab('edit')`
fired.

**Fix.** Pass `onSetReport={setGeneratedReport}` from the route.
Now "Edit manually" both creates the empty report skeleton *and*
switches tabs, exactly as the provider docs claim.

**Test.** Covered by the Maestro `core-end-to-end.yaml` flow
asserting `edit-section-meta` is visible after the round-trip.

**Pattern.** R5 — the provider unit tests stubbed `onSetReport`,
so the bug only existed at the wiring layer (Pitfall 13 / Hard
Rule #5: "test the default wiring").

### 2026-05-15 — lucide icons silently fell back to brand placeholder; `react-native-svg` was never installed (Pattern R5)

**Symptom.** Every ported screen rendered, but every lucide icon
(MapPin, Calendar, FolderOpen, Pencil, Plus, …) showed as the
Harpa Pro "U" brand placeholder. Vitest unit snapshots passed
because they render the JSX tree and never resolve the SVG
primitives. Coverage was green. Only a manual `simctl io
screenshot` on the mock build caught it.

**Root cause.** `lucide-react-native` lists `react-native-svg` as a
peer dependency. We had been adding lucide imports across screens
through P2 + P3 without ever running `npx expo install
react-native-svg`. RNSVG was never linked into the iOS Pods, so
at runtime the bridge fell back to a default Image — which, with
no source, rendered the brand asset.

**Fix.** [TBD commit] — `apps/mobile/package.json` adds
`react-native-svg@15.8.0`. Pod reinstall via `expo run:ios` picks
up `RNSVG` and the icons render.

**Test.** No unit test would have caught this — RNSVG only matters
on the device. The new tmp `.maestro/tmp-p3-smoke/` flow captures
screenshots of every ported screen in the mock build so a missing
native dep is visible immediately. P3.13's `core-end-to-end`
Maestro flow inherits this guarantee and replaces the tmp folder.

**Pattern.** R5 — the unit/integration suites injected stubs (the
JSX tree) instead of exercising the real wiring (the native SVG
runtime). The default wiring was silently broken; only an E2E
against the live binary surfaced it.

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

**Pattern.** R5 (new — added above).

### 2026-05-15 — `/auth/logout` deletes the session row but the JWT keeps working (Pattern R5)

**Symptom.** After `POST /auth/logout` (200 OK), the bearer token
that was just "revoked" continues to authenticate every protected
route — `GET /me`, `POST /projects`, etc — until its JWT `exp`
naturally lapses (~7 days). Surfaced by the first journey
integration test
(`packages/api/src/__tests__/journeys/auth-crud.journey.integration.test.ts`),
which logs in via the real `/auth/otp/verify` path and then
expected `GET /me` to 401 post-logout.

**Root cause.** `middleware/auth.ts → withAuth()` validates only the
JWT signature + expiry. The per-request scope wrapper
(`db/scope.ts → withScopedConnection`) does `SET LOCAL app.session_id`
from the JWT's `sid` claim but never checks `auth.sessions` for an
existing row — so revoked sessions remain authenticated as long as
the JWT is signature-valid. The header comment in `middleware/auth.ts`
("Session-row validation … is enforced by route handlers — see e.g.
`routes/me.ts`") is stale; no route actually validates the session.

The existing `auth.integration.test.ts > logout deletes the session
row` test confirmed the DB row was gone but never made a
post-logout authenticated request, so the gap was invisible.
Classic R5 — the test asserted a side-effect, not the contract.

**Fix.** Pending. Either:
1. Have `withAuth()` look up `auth.sessions` by `sid` and 401 when
   the row is missing/expired (one DB roundtrip per authed
   request). Cache via short-lived in-memory revocation set if
   needed.
2. Use opaque session tokens (DB-backed) instead of stateless JWTs
   for the bearer envelope, keeping the JWT only as an internal
   signed claim payload.

Pending the fix, `auth-crud.journey.integration.test.ts` asserts
the DB-row deletion (current behaviour) and links to this entry.

**Test.** The journey suite
(`packages/api/src/__tests__/journeys/*.journey.integration.test.ts`)
should add — once the fix lands — `expect(/me-post-logout).toBe(401)`.

**Pattern.** R5 — DI stubs / test helpers (`signTestToken`) became
the de-facto spec. Every CRUD integration test mints tokens via
`signTestToken(userId, sessionId)`, so the full
`/auth/otp/verify` → CRUD → `/auth/logout` chain was never
exercised end-to-end and the revocation gap stayed invisible.

### 2026-05-15 — `auth.test.ts > rejects a tampered token` flakes ~6% (Pattern R6)

**Symptom.** PR #3 unit job failed with
`expected 200 to be 401` in
`packages/api/src/middleware/auth.test.ts:38` on commit `bbcbdfc`
(a CSS-only change to `apps/marketing`), while the immediately
preceding commit `b00ce5a` on the same branch was green. The "diff"
that triggered the failure had no causal relationship to the
failing test.

**Root cause.** The test "tampered" with the JWT by flipping its
last base64url character between `'A'` and `'B'`. HS256 signatures
are 32 bytes → 43 base64url chars; the last char encodes only 4
significant bits plus 2 padding bits that base64 decoders discard.
Chars `A`, `B`, `C`, `D` all share top-4 bits `0000`, so swapping
between them produces an **identical** decoded signature and the
token still verifies. Whether the flip actually mutates the
signature depends on the trailing char, which in turn depends on
the `iat` / `exp` timestamps embedded in the freshly-signed JWT —
roughly a 6% flake rate (4 of 64 base64url chars are equivalent
under the A↔B swap).

**Fix.** Tamper with the **payload** segment instead — flipping the
first payload char (always `e` in jose-issued tokens, since the
JSON starts with `{"`) to `a`. Any byte change in the
base64url-encoded payload invalidates the HMAC over
`header.payload`, so the verification deterministically fails.

**Test.** `packages/api/src/middleware/auth.test.ts > withAuth >
rejects a tampered token` — same test, deterministic tampering
strategy. Verified by running it 5× locally post-fix (5/5 green)
and by reasoning about the algebra of the swap.

**Pattern.** R6 — Probabilistic test inputs derived from
freshly-minted JWTs / random bytes / timestamps. The naive "flip a
char" trick is safe for character-aligned encodings (hex) but lossy
for base64/base64url when the encoding has padding bits. Mitigation:
when constructing "obviously invalid" variants of signed/encoded
blobs, mutate bytes in the **decoded** representation (or mutate a
segment whose every bit is significant — for JWTs, the header or
payload, not the tail of the signature).
