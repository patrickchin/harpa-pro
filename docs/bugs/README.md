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

`expo-router` auto-discovers routes by globbing `app/**/*.{ts,tsx}`.
A colocated `*.test.tsx` inside that tree is therefore treated as a
route and pulled into the Metro graph at runtime — transitively
dragging in `vitest`, `@vitest/runner/utils`, `chai`, etc., none of
which Metro can resolve. The app then explodes at app-open with
`Unable to resolve "@vitest/runner/utils"`. Vitest itself stays
green (it picks up the test fine), so CI is no help. Mitigation:
keep tests outside `app/`. Use `apps/mobile/__tests__/...` (mirror
the route path under that subtree), or `apps/mobile/screens/` for
pure screen-body tests. Helper files (`*.ts` without a default
export) that need to live in `app/` must be prefixed with `_` so
the route scanner skips them.

### R3 — Rules of Hooks violation in expo-router layouts with auth gates

A layout that calls `useAuthSession()` (or any other hook) then
returns `<Redirect />` early on `loading`/`unauthenticated` and only
afterwards calls more hooks (`useCallback`, `useEffect`, …) will
crash with `Rendered fewer hooks than expected` the moment the auth
state flips. Vitest snapshot tests only render once, never re-render
across an auth transition, so they catch nothing. The pattern:

  // ❌ BAD — early return between hook calls
  function Layout() {
    const { status } = useAuthSession();
    if (decideRedirect(status)) return <Redirect />;
    useEffect(...);                // hook count varies between renders
  }

  // ✅ GOOD — all hooks before any conditional return
  function Layout() {
    const { status } = useAuthSession();
    useEffect(...);
    if (decideRedirect(status)) return <Redirect />;
  }

Mitigation: write a re-render test that flips auth state between
`loading → unauthenticated → authenticated` and asserts the layout
doesn't throw. Catalogued for all future layouts with auth gates,
deep-link gates, or feature-flag gates.

### R2 — `.js` extensions in relative TS imports break Metro bundling

Mobile (Expo / Metro) cannot resolve `from './foo.js'` when the
on-disk file is `foo.ts` / `foo.tsx`. TypeScript happily compiles
it (it's the recommended ESM import shape and matches our
`packages/*` style), and Vitest resolves it via tsconfig paths,
so unit tests stay green while iOS bundling fails the moment
that module is reached. The recurrence vector is twofold:
(1) hand-written code mirroring the API package style,
(2) the `gen-hooks.ts` template which emits `from './client.js'`
into `lib/api/hooks.ts` on every regen. Mitigation: keep
`apps/mobile/**/*.{ts,tsx}` free of `.js`-suffixed relative
imports; fix the generator template too, not just its output.

### R1 — Framework swallow: thrown non-Error values bypass middleware

A try/catch in a framework's dispatch loop that does
`if (err instanceof Error) onError(err, c)` will silently re-throw
(or propagate up to the runtime as an uncaught exception) for any
non-Error throw — `throw 'oops'`, `throw 42`, `throw null`,
`throw { foo: 'bar' }`. The mapper / error-handling middleware
never runs, so the wire response shape and any leak guarantees
the mapper enforces are bypassed too. Lint cannot catch this:
TypeScript permits `throw <unknown>`. Mitigation: keep the codebase
disciplined to throw Error subclasses, and assert this contract
narrowly in property tests (don't pretend the framework will save
you).

### R5 — DI stubs become the spec; default wiring silently broken

Every test injects a "happy" stub for a collaborator
(`alwaysOkTurnstile()`, `recordingResend()`, `inMemoryRateLimiter()`,
…). The unit/integration suite goes green even though the **default**
client returned by the factory (`createTurnstileClient()`,
`createResendClient()`, …) is broken — the production-fake config
that `docker compose up`, `:mock` builds, and PR previews actually
run with is never exercised. Symptoms:

- Form / endpoint returns 2xx in the browser.
- Server logs look clean.
- DB / outbound side-effect never happens.
- No test in the suite ever called the factory without overriding it.

The factory is, in effect, untested. Two recurrence vectors:

1. Helper functions like `setWaitlistClients({ turnstile, resend })`
   make injection so cheap that every test does it.
2. Fake-mode helpers (`fakeTurnstile`, `fakeR2`, fake-Twilio) accept
   only a hand-crafted token shape (`tt-…`, `fake-…`) that real-world
   widgets never produce, so dev / mock builds silently fail closed.

Mitigation:

- For every collaborator factory, write **at least one integration
  test that does NOT inject a stub**. Call the route through the
  default-wired client and assert the real side-effect (a DB row,
  a queued email, a recorded fixture call). See
  [arch-testing.md → "Test the default wiring"](../v4/arch-testing.md#test-the-default-wiring).
- Prefer fake-mode helpers that accept what the real widget /
  client produces in dev. If you need a "rejected" branch for
  tests, inject `alwaysFailX()` in that specific test — don't
  encode rejection into a magic token shape the dev path will
  trip over.
- Browser/device E2E (Playwright for the marketing site, Maestro
  for mobile) hitting the live compose stack closes the residual
  gap. Treat E2E as the contract for the default wiring.

## Entries

### 2026-05-12 — Hono v4 onError ignores non-Error throws (Pattern R1)

**Symptom.** A handler that does `throw 'oops'` (or any non-Error
value) crashes the worker with an unhandled exception instead of
returning a 500 envelope. Discovered while writing the P1.10
property tests for `errorMapper`; not (yet) seen in production.

**Root cause.** Hono v4's dispatch loop only invokes `app.onError`
for `Error` instances; non-Error throws propagate out of
`app.fetch`. Our `errorMapper` therefore can't enforce the envelope
or leak guarantees on those throws — they never reach it.

**Fix.** No code change. Documented as Pattern R1; the property
test (`packages/api/src/__tests__/errorMapper.property.test.ts`)
narrows its "unhandled error" arbitrary to Error subclasses
(Error, TypeError, RangeError, custom-name Error) — the realistic
universe given our codebase only throws Error subclasses (mostly
HTTPException / ZodError / AiProviderError). If we ever need to
cover this, the fix is a tiny outermost middleware that wraps
`await next()` in `try { … } catch (e) { throw e instanceof Error
? e : new Error(String(e)); }` — explicitly carved out of P1.10.

**Test.** `errorMapper.property.test.ts` — the narrowed unhandled-
error property + comment pinning the limitation.

**Pattern.** R1 (new — added above).

### 2026-05-13 — `.js` extensions reappeared in mobile relative imports (Pattern R2)

**Symptom.** `pnpm --filter @harpa/mobile ios` fails Metro bundling
with `Unable to resolve "./session.js" from "apps/mobile/lib/auth/index.ts"`
during P3.0 dev-gallery launch. Vitest stayed green; problem only
visible when the simulator actually tried to load the bundle.

**Root cause.** Same as commit `0036006`: mobile relative TS imports
written as `./foo.js` (TS-recommended ESM shape, fine for Node /
the API package, broken under Metro). Two re-introduction sources:
(1) new auth/api modules added in P2.4–P2.7 mirroring the API
style, and (2) the `apps/mobile/scripts/gen-hooks.ts` template
emitting `from './client.js'` etc. into the regenerated
`lib/api/hooks.ts`.

**Fix.** Stripped `.js` from every relative import under
`apps/mobile/**/*.{ts,tsx}` (24 sites across `lib/api/*`,
`lib/auth/*`, `screens/dev-gallery.test.ts`), and updated the
generator template in `scripts/gen-hooks.ts` so future regens
don't bring it back. Catalogued as Pattern R2 above.

**Test.** Manual: rerun `pnpm --filter @harpa/mobile ios` and
confirm bundling succeeds. (No automated guard yet — a CI grep
gate `apps/mobile/**/*.{ts,tsx}` for
`from '\\./[^']+\\.js'` would have caught it; deferred to P4
infra hardening with a carve-out note.)

**Pattern.** R2 (new — added above).

### 2026-05-13 — AppLayout hook-order crash on auth-gate flip (Pattern R3)

**Symptom.** Cold-launching the app on the iOS simulator produced
`Rendered fewer hooks than expected. This may be caused by an
accidental early return statement.` in `AppLayout`, immediately
unmounted to the dev error overlay. Vitest stayed green —
no test re-rendered the layout across an auth-state transition.

**Root cause.** `apps/mobile/app/(app)/_layout.tsx` called
`useAuthSession()`, then on `loading` / `unauthenticated` returned
`<Redirect href={…} />` **before** `useCallback(handleBackPress)`
and `useEffect(BackHandler)` ran. The hook count therefore changed
when the gate flipped from `loading` (early return, 3 hooks) to
`authenticated` (no early return, 5 hooks) on the next render.

**Fix.** Moved every hook above the conditional return.
Added a regression test
`apps/mobile/__tests__/layouts/app-layout.test.tsx` that mounts
the layout with status `loading`, then re-renders with
`unauthenticated`, then `authenticated`, asserting the layout
never throws. Verified by `git stash`-ing the production fix and
re-running the test — it captures the exact
"Rendered fewer hooks" error message.

**Test.** `apps/mobile/__tests__/layouts/app-layout.test.tsx` —
specifically the "does not throw … when status flips" case. Three
companion cases assert the rendered output for each terminal
status.

**Pattern.** R3 (new — added above).

### 2026-05-13 — Vitest leaked into mobile bundle via colocated `*.test.tsx` (Pattern R4)

**Symptom.** Right after landing the R3 regression test inside
`apps/mobile/app/(app)/_layout.test.tsx`, the iOS bundle errored at
runtime with
`Unable to resolve "@vitest/runner/utils" from node_modules/vitest/dist/index.js`
on every screen mount. Vitest itself ran the file fine; only the
Metro bundle was affected.

**Root cause.** `expo-router` auto-discovers routes by globbing
`app/**/*.{ts,tsx}` via `require.context`. The test file matched
that glob, was pulled into the Metro graph at app boot, and
transitively dragged in `vitest` → `@vitest/runner/utils` →
`chai`, none of which Metro can resolve.

**Fix.** Moved the test to
`apps/mobile/__tests__/layouts/app-layout.test.tsx` (outside the
routed `app/` tree, mirroring the route path so it stays
discoverable). Also renamed `apps/mobile/app/(dev)/registry.ts`
→ `_registry.ts` — same root cause for the long-standing
"Route registry.ts is missing the required default export"
warning, since route-scanner conventions skip files prefixed with
`_`.

**Test.** Pattern-level guard, not a single test: the iOS bundle
smoke-test added to `docs/v4/overnight-protocol.md` §5 (now run
after every commit) catches this regression. Run locally with
`pnpm --filter @harpa/mobile bundle:smoke` (added in the same
commit).

**Pattern.** R4 (new — added above).

### 2026-05-14 — Waitlist 202s with empty DB; fake-Turnstile required a magic token shape (Pattern R5)

**Symptom.** Submitting the marketing waitlist form against the
local `docker compose` stack returned the "Check your inbox" state,
yet `app.waitlist_signups` stayed empty and no confirmation email
was queued. Caught by the human running it; no automated test
flagged it.

**Root cause.** `fakeTurnstile()` in
`packages/api/src/lib/turnstile.ts` accepted only tokens starting
with `tt-`. The Cloudflare test-key widget in the browser emits
real-format tokens (e.g. `XXXX.DUMMY.TOKEN.XXXX`), so the route's
Turnstile check failed and returned the neutral 202 (the deliberate
silent rejection for bots). Every existing integration test
injected `alwaysOkTurnstile()` via `setWaitlistClients({…})`, so
the default factory was never exercised — classic DI-stubs-as-spec.

**Fix.** Loosened `fakeTurnstile()` to accept any non-empty token
(still rejects empty as "widget not wired") and added an integration
test that calls `/waitlist` without injecting a Turnstile stub,
asserting both the DB row and the queued email. The form was also
moved onto the shared `waitlistSignupRequest` schema from
`@harpa/api-contract` (`safeParse` + schema-derived `maxLength`
attrs) so over-length submissions surface as field-level errors
instead of generic 400s.

**Test.** `packages/api/src/__tests__/waitlist.integration.test.ts`
— two new cases: "default fakeTurnstile accepts any non-empty
token end-to-end" and "default fakeTurnstile rejects empty token".
Marketing site Playwright E2E (driving the live form against the
compose stack) is the longer-term gate — tracked as the next step
in `docs/v4/arch-testing.md`.

**Pattern.** R5 (new — added above).
