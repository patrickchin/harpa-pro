# Recurring bugs log

> Catalogue of bugs that have bitten us more than once and the
> patterns (R1, R2, …) that produce them. The summary below
> should usually be enough; open the per-entry detail file only
> when you need the full reasoning, fixtures, or commit pointers.
>
> See also:
> - [`AGENTS.md`](../../AGENTS.md) — hard rules + recurring-bugs reminder.
> - [`docs/v4/pitfalls.md`](../v4/pitfalls.md) — design-level lessons from the v3 attempt that map 1:1 to the hard rules.
> - [`docs/v4/architecture.md`](../v4/architecture.md) — system overview.

## How to add a new entry

When you ship a fix for a bug that recurred, almost recurred, or only
got caught by manual QA / E2E despite green tests:

1. Create a new file in this directory named
   `YYYY-MM-DD-<short-slug>.md` containing the full write-up using
   the structure below.
2. Add a one-block summary to the **Bugs** index in this README,
   linking to the new file. The summary alone should usually be
   enough — readers should only need to open the detail file when
   they want the full reasoning, fixtures, or commit pointers.
3. If the bug is a new variant of an existing pattern, tag it
   `(Pattern Rn)`. If it warrants a new pattern, add it under
   **Patterns** below and reference it from the entry.

### Detail-file structure

```markdown
# YYYY-MM-DD — short title (Pattern Rn if applicable)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** What went wrong (user-visible).
**Root cause.** Why.
**Fix.** PR/commit + the change in one sentence.
**Test.** The new automated test that would have caught it.
**Pattern.** Which Rn this maps to (or "new pattern Rn — added to README").
```

## Patterns

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

### R6 — owner-demotion via re-invite (implicit upsert on POST /members)

A `POST /projects/{project}/members` handler that uses `INSERT … ON CONFLICT DO
UPDATE` (upsert) lets an owner call the endpoint with their own phone number
and a lower role (`viewer`, `editor`), silently demoting themselves. If they
are the sole owner this locks the project out of all owner-only operations
(member management, project delete) with no recovery path short of a DB patch.

**Protection.** `app.add_project_member_by_phone` uses an explicit `IF EXISTS`
guard and raises `23505` ("already_member") mapped to 409 `MEMBER_EXISTS`.
Role changes must go through `PATCH /projects/{project}/members/{user}` (a
separate, explicitly guarded endpoint). Full design in
[`docs/v4/arch-project-members.md`](../v4/arch-project-members.md).

**Test that must exist.** S3 in the members integration suite: owner A calls
`POST` with their own phone → asserts 409 `MEMBER_EXISTS`, then confirms
`GET /members` still shows A as `owner`.

---

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

## Bugs

Most recent first. Each entry links to its full write-up.

### 2026-05-24 — Android back gesture required two presses on every nested screen because `useNavigation()` in a layout returns the parent navigator

**Symptom.** On Android, swiping/pressing back inside any nested
screen (e.g. `projects/[id]`) showed the "Press back again to exit"
toast and required a second press to actually navigate back.
The double-press behaviour was supposed to apply only at the app
root (when back would otherwise close the app).

**Fix.** Use `router.canGoBack()` from `expo-router`
(`useRouter()`), which inspects the global router state across all
nested navigators. Commit on this branch.

Detail: [`2026-05-24-android-back-double-press.md`](2026-05-24-android-back-double-press.md)

### 2026-05-23 — Generate Report returned 502 "AI provider request failed." in dev because the prompt told GPT-4o to emit v3 JSON while the contract validated v4 *(Pattern R5)*

**Symptom.** Tapping **Generate Report** in the mobile dev build
returned a 502 with the canned message `AI provider request
failed.` Fly logs showed
`AiProviderError: generateReport: provider response did not match
report schema` for every request. Every replay-mode integration
test stayed green, so the bug only surfaced in live dev.

**Fix.** `fix(api): align report prompts with v4 reportBody, add live-LLM CI`
— rewrote both `REPORT_SYSTEM_PROMPT` and `REPORT_UPDATE_SYSTEM_PROMPT`
to describe the unwrapped v4 shape using the exact field names from
`reportBody`; switched the report chat call to OpenAI's
`response_format: { type: 'json_object' }`; widened the
server-side log line to include Zod issue paths (not the payload)
so future drift is diagnosable from Fly logs alone.

Detail: [`2026-05-23-report-prompt-v3-v4-drift.md`](2026-05-23-report-prompt-v3-v4-drift.md)

### 2026-05-22 — `pickStorage()` read `process.env.R2_FIXTURE_MODE` directly while every other line in the module read `env.R2_*` *(Pattern R5)*

**Symptom.** None in production — caught proactively during the
P3.15 camera-upload audit. The bug would have surfaced as a silent
disagreement: any test or process that mutated `process.env.R2_FIXTURE_MODE`
after `env.ts` parsed (e.g. a test that toggles `live` mid-suite, or
a future ESM bundler tree-shaking decision that froze `env` earlier)
would have made `pickStorage()` return one storage flavour while
`R2Storage`'s constructor read its bucket/credentials from the
Zod-parsed `env` const — i.e. live R2 selection with replay-mode
config (or vice-versa).

**Fix.** Two commits:

- `refactor(api): pickStorage reads parsed env (Pitfall 13 trapdoor)`
  — `pickStorage()` now branches on `env.R2_FIXTURE_MODE`.
- `test(api): exercise R2Storage default-wiring against MinIO`
  (`files.r2-live.integration.test.ts`) — boots a MinIO container
  via Testcontainers, sets the env, reloads the modules, calls the
  real `/files/presign` route and asserts the SigV4 PUT against
  MinIO returns 200. No DI stubs.

Detail: [`2026-05-22-pickstorage-process-env-trapdoor.md`](2026-05-22-pickstorage-process-env-trapdoor.md)

### 2026-05-22 — Maestro flows hardcoded `appId: com.harpa.pro`; the dev variant ran the wrong app *(Pattern R-Maestro1)*

**Symptom.** A planned `com.harpa.pro.dev` bundle id for the dev
EAS profile would have shipped immediately — and every Maestro
flow under `.maestro/` declares `appId: com.harpa.pro`. Running
`maestro test` against the dev sim would have launched (and asserted
against) the prod bundle silently: either an unrelated install
shown to Maestro, or an outright `appId not installed` failure
that wastes a CI minute per flow. We're catching this proactively
before the dev variant lands.

**Fix.** `feat(maestro): parameterise appId via MAESTRO_APP_ID` —
every `.maestro/**/*.yaml` flow now uses
`appId: ${MAESTRO_APP_ID}`. The README documents the export and the
simctl grants reference `"$MAESTRO_APP_ID"`. A new lint guard,
`scripts/check-maestro-appid.sh`, greps for any literal
`com.harpa.pro` in `.maestro/**/*.yaml` and fails the lint job if
found.

Detail: [`2026-05-22-maestro-appid-hardcoded.md`](2026-05-22-maestro-appid-hardcoded.md)

### 2026-05-22 — `AI_LIVE=1` shipped to prod but no request ever reached the live vendor *(Pattern R5)*

**Symptom.** Doppler had `AI_LIVE=1` + `OPENAI_API_KEY` set on `prd`,
Fly deploy was green, `/readyz` healthy, no errors in logs. But
`api.openai.com` access logs were empty and reports kept replaying
the canned `generate-report.full` fixture. To users this looked
indistinguishable from working AI — until a customer noticed two
distinct site visits produced byte-identical reports.

**Fix.** `feat/ai-live-prod-dev` — `pickMode()` now takes a
`callerFixtureName?: string` and only forces replay when the
*external* caller passed it. Derived defaults are computed after the
mode decision. Also wired the real provider factory (OpenAI for chat,
Groq `whisper-large-v3-turbo` for transcribe) into `buildProvider()`
so live mode no longer 502s on missing real-factory.

Detail: [`2026-05-22-ai-live-pickmode-dead-code.md`](2026-05-22-ai-live-pickmode-dead-code.md)

### 2026-05-20 — prod returned 200 on /healthz while every DB route 500'd *(Pattern R7)*

**Symptom.** Fly machine `harpa-pro-api` v11 was `started`, 1/1
health checks passing, image deployed cleanly. But every endpoint
that touched the DB returned `500 { code: "internal_error" }`.
Postgres logs showed `42P01 relation "app.waitlist_signups" does
not exist` for `POST /waitlist`, `relation "auth.verifications"
does not exist` for `POST /auth/otp/start`, etc.

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

Detail: [`2026-05-20-healthz-static-literal-prod-down.md`](2026-05-20-healthz-static-literal-prod-down.md)

### 2026-05-18 — saved-report route rendered "Failed to load report" because the API body wasn't adapted to the UI shape *(Pattern R5)*

**Symptom.** After tapping Finalize on the generate route the app
navigated to the saved-report route, which immediately rendered the
"Failed to load report" error state. The underlying `GET
/reports/:id` succeeded and returned a populated `body`, but the
view treated it as missing.

**Fix.** 1. Call `reportBodyToGeneratedReport(reportRow.body)` from the
   saved-report route when `reportRow.body` is present, falling
   back to the fixture sample only in fixture mode.
2. Cover the route with the `p3-report-wiring.yaml` Maestro flow
   that finalizes a real seeded draft and asserts saved-report
   renders Workers / Materials / Issues / Weather correctly.

Detail: [`2026-05-18-saved-report-body-adapter-missing.md`](2026-05-18-saved-report-body-adapter-missing.md)

### 2026-05-18 — iOS XCTest cannot deliver `tapOn` to `Pressable` inside a native RN `Modal` (Maestro flakiness)

**Symptom.** A Maestro `tapOn: btn-report-delete` against a
`Pressable` rendered inside `ReportActionsMenu`'s native `<Modal>`
reports COMPLETED, but the `onPress` handler is never invoked.
Adjacent buttons in `AppDialogSheet` (also a Modal) tap fine.

Detail: [`2026-05-18-maestro-modal-pressable-tap.md`](2026-05-18-maestro-modal-pressable-tap.md)

### 2026-05-18 — `expo-camera` native module missing crashed boot on dev-clients without the linked module

**Symptom.** Launching the dev-client app produced an immediate
redbox: `Cannot find native module 'ExpoCamera'`. The crash
happened at module evaluation of `screens/camera-capture.tsx`
because `expo-camera`'s top-level code calls
`requireNativeModule('ExpoCamera')` eagerly, even if the
`CameraView` component is never mounted.

**Fix.** Added `apps/mobile/lib/native/expo-camera-shim.ts` which
wraps `require('expo-camera')` in a try/catch and re-exports
`CameraView` / `useCameraPermissions` with safe fallbacks that
render an inline "Camera unavailable" message when the native
module is missing. `screens/camera-capture.tsx` now imports from
the shim. The shim keeps the typings intact so the rest of the app
is unchanged.

Detail: [`2026-05-18-expo-camera-native-module-missing.md`](2026-05-18-expo-camera-native-module-missing.md)

### 2026-05-17 — invite-member form auto-closes on submit, hiding the API error *(Pattern R5)*

**Symptom.** A failed `POST /projects/:slug/members` invite (e.g.
the invited phone has no account → 404 "User not found.") looked
identical to a successful one from the user's perspective: the
invite form collapsed back to the "Add member" CTA with no error
notice visible. The Members list stayed empty and the user had no
clue why. First caught by `core-end-to-end.yaml` Maestro flow,
which expected the invited user to show up under "Editor" filter.

**Fix.** Drive the close from the *route*, not from inside the
form. The mutation hook's `onSuccess` increments an
`addSuccessNonce` counter passed to the screen; an effect there
closes the form when the nonce changes. On failure, `nonce` does
not change, the form stays open, and the error notice renders
normally. Same PR adds two regression tests in
`screens/project-members.test.tsx`: one for the form-stays-open
path on error, one for the form-closes path on success.

Detail: [`2026-05-17-invite-form-auto-close-on-error.md`](2026-05-17-invite-form-auto-close-on-error.md)

### 2026-05-17 — `btn-edit-manually` switched tabs but didn't seed the empty report *(Pattern R5)*

**Symptom.** Tapping "Edit manually" from the Report tab's
empty-state navigated to the Edit tab but the Edit tab still
showed *its* empty-state ("Generate a report first to edit"). The
user could not enter section data manually — which is the whole
point of the button. First caught by `core-end-to-end.yaml`
asserting `edit-section-meta` after tapping `btn-edit-manually`.

**Fix.** Pass `onSetReport={setGeneratedReport}` from the route.
Now "Edit manually" both creates the empty report skeleton *and*
switches tabs, exactly as the provider docs claim.

Detail: [`2026-05-17-edit-manually-missing-onsetreport.md`](2026-05-17-edit-manually-missing-onsetreport.md)

### 2026-05-15 — lucide icons silently fell back to brand placeholder; `react-native-svg` was never installed *(Pattern R5)*

**Symptom.** Every ported screen rendered, but every lucide icon
(MapPin, Calendar, FolderOpen, Pencil, Plus, …) showed as the
Harpa Pro "U" brand placeholder. Vitest unit snapshots passed
because they render the JSX tree and never resolve the SVG
primitives. Coverage was green. Only a manual `simctl io
screenshot` on the mock build caught it.

**Fix.** [TBD commit] — `apps/mobile/package.json` adds
`react-native-svg@15.8.0`. Pod reinstall via `expo run:ios` picks
up `RNSVG` and the icons render.

Detail: [`2026-05-15-lucide-icons-react-native-svg-missing.md`](2026-05-15-lucide-icons-react-native-svg-missing.md)

### 2026-05-15 — `/auth/logout` deletes the session row but the JWT keeps working *(Pattern R5)*

**Symptom.** After `POST /auth/logout` (200 OK), the bearer token
that was just "revoked" continues to authenticate every protected
route — `GET /me`, `POST /projects`, etc — until its JWT `exp`
naturally lapses (~7 days). Surfaced by the first journey
integration test
(`packages/api/src/__tests__/journeys/auth-crud.journey.integration.test.ts`),
which logs in via the real `/auth/otp/verify` path and then
expected `GET /me` to 401 post-logout.

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

Detail: [`2026-05-15-logout-jwt-not-revoked.md`](2026-05-15-logout-jwt-not-revoked.md)

### 2026-05-15 — `auth.test.ts > rejects a tampered token` flakes ~6% *(Pattern R6)*

**Symptom.** PR #3 unit job failed with
`expected 200 to be 401` in
`packages/api/src/middleware/auth.test.ts:38` on commit `bbcbdfc`
(a CSS-only change to `apps/marketing`), while the immediately
preceding commit `b00ce5a` on the same branch was green. The "diff"
that triggered the failure had no causal relationship to the
failing test.

**Fix.** Tamper with the **payload** segment instead — flipping the
first payload char (always `e` in jose-issued tokens, since the
JSON starts with `{"`) to `a`. Any byte change in the
base64url-encoded payload invalidates the HMAC over
`header.payload`, so the verification deterministically fails.

Detail: [`2026-05-15-auth-tampered-token-base64-flake.md`](2026-05-15-auth-tampered-token-base64-flake.md)

### 2026-05-14 — Waitlist 202s with empty DB; fake-Turnstile required a magic token shape *(Pattern R5)*

**Symptom.** Submitting the marketing waitlist form against the
local `docker compose` stack returned the "Check your inbox" state,
yet `app.waitlist_signups` stayed empty and no confirmation email
was queued. Caught by the human running it; no automated test
flagged it.

**Fix.** Loosened `fakeTurnstile()` to accept any non-empty token
(still rejects empty as "widget not wired") and added an integration
test that calls `/waitlist` without injecting a Turnstile stub,
asserting both the DB row and the queued email. The form was also
moved onto the shared `waitlistSignupRequest` schema from
`@harpa/api-contract` (`safeParse` + schema-derived `maxLength`
attrs) so over-length submissions surface as field-level errors
instead of generic 400s.

Detail: [`2026-05-14-fake-turnstile-magic-token.md`](2026-05-14-fake-turnstile-magic-token.md)

### 2026-05-13 — Vitest leaked into mobile bundle via colocated `*.test.tsx` *(Pattern R4)*

**Symptom.** Right after landing the R3 regression test inside
`apps/mobile/app/(app)/_layout.test.tsx`, the iOS bundle errored at
runtime with
`Unable to resolve "@vitest/runner/utils" from node_modules/vitest/dist/index.js`
on every screen mount. Vitest itself ran the file fine; only the
Metro bundle was affected.

**Fix.** Moved the test to
`apps/mobile/__tests__/layouts/app-layout.test.tsx` (outside the
routed `app/` tree, mirroring the route path so it stays
discoverable). Also renamed `apps/mobile/app/(dev)/registry.ts`
→ `_registry.ts` — same root cause for the long-standing
"Route registry.ts is missing the required default export"
warning, since route-scanner conventions skip files prefixed with
`_`.

Detail: [`2026-05-13-vitest-leak-via-colocated-tests.md`](2026-05-13-vitest-leak-via-colocated-tests.md)

### 2026-05-13 — `.js` extensions reappeared in mobile relative imports *(Pattern R2)*

**Symptom.** `pnpm --filter @harpa/mobile ios` fails Metro bundling
with `Unable to resolve "./session.js" from "apps/mobile/lib/auth/index.ts"`
during P3.0 dev-gallery launch. Vitest stayed green; problem only
visible when the simulator actually tried to load the bundle.

**Fix.** Stripped `.js` from every relative import under
`apps/mobile/**/*.{ts,tsx}` (24 sites across `lib/api/*`,
`lib/auth/*`, `screens/dev-gallery.test.ts`), and updated the
generator template in `scripts/gen-hooks.ts` so future regens
don't bring it back. Catalogued as Pattern R2 above.

Detail: [`2026-05-13-mobile-js-extension-relative-imports.md`](2026-05-13-mobile-js-extension-relative-imports.md)

### 2026-05-13 — AppLayout hook-order crash on auth-gate flip *(Pattern R3)*

**Symptom.** Cold-launching the app on the iOS simulator produced
`Rendered fewer hooks than expected. This may be caused by an
accidental early return statement.` in `AppLayout`, immediately
unmounted to the dev error overlay. Vitest stayed green —
no test re-rendered the layout across an auth-state transition.

**Fix.** Moved every hook above the conditional return.
Added a regression test
`apps/mobile/__tests__/layouts/app-layout.test.tsx` that mounts
the layout with status `loading`, then re-renders with
`unauthenticated`, then `authenticated`, asserting the layout
never throws. Verified by `git stash`-ing the production fix and
re-running the test — it captures the exact
"Rendered fewer hooks" error message.

Detail: [`2026-05-13-app-layout-hook-order-auth-gate.md`](2026-05-13-app-layout-hook-order-auth-gate.md)

### 2026-05-12 — Hono v4 onError ignores non-Error throws *(Pattern R1)*

**Symptom.** A handler that does `throw 'oops'` (or any non-Error
value) crashes the worker with an unhandled exception instead of
returning a 500 envelope. Discovered while writing the P1.10
property tests for `errorMapper`; not (yet) seen in production.

**Fix.** No code change. Documented as Pattern R1; the property
test (`packages/api/src/__tests__/errorMapper.property.test.ts`)
narrows its "unhandled error" arbitrary to Error subclasses
(Error, TypeError, RangeError, custom-name Error) — the realistic
universe given our codebase only throws Error subclasses (mostly
HTTPException / ZodError / AiProviderError). If we ever need to
cover this, the fix is a tiny outermost middleware that wraps
`await next()` in `try { … } catch (e) { throw e instanceof Error
? e : new Error(String(e)); }` — explicitly carved out of P1.10.

Detail: [`2026-05-12-hono-onerror-non-error-throws.md`](2026-05-12-hono-onerror-non-error-throws.md)
