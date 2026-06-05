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
2. Add a one-line entry to the **Bugs** index in this README,
   linking to the new file. Keep it to one bullet: date, pattern
   tag, the smell (what broke + the why in one sentence), the fix
   in a few words, then the detail link. Readers should only need
   to open the detail file when they want the full reasoning,
   fixtures, or commit pointers.
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

Most recent first. One line per bug — open the linked file only for the full root-cause / test / commit write-up.

- **2026-06-05** *(R5)* — `workers[].count` was strict `z.number().int().nonnegative()`, so /reports/:n/regenerate 502'd whenever notes mentioned a role without a specific headcount and the LLM emitted `count: null` (HARPA-PRO-6, dev + 1 prod hit on `0.1.5+6dc0bd5`). Replay fixtures all carried integer counts so unit tests stayed green. Fix: widen the contract field to `.nullable()` (mirrors `hours`); update both prompts to advertise `"count": int>=0|null` with an explicit "use null when unknown" rule; extend the offline drift guard to assert the prompt's nullability hint (not just the field name); harden the adapter `totalWorkers` reduction with `?? 0`; rehash report fixtures. [detail](2026-06-05-workers-count-non-nullable.md)
- **2026-05-30** — Voice-note transcript dialog wouldn't scroll: `AppDialogSheet` wrapped its sheet body in a `Pressable` (to absorb backdrop-dismiss taps), and a `Pressable` parent steals pan gestures from a nested `ScrollView` via the responder-capture phase, so the `ScrollView` in the "View transcript" stage in `NoteOptionsSheet` could never scroll long transcripts. Fix: replace the inner `Pressable` with a `View` that uses `onStartShouldSetResponder={() => true}` to consume taps without using capture, plus `nestedScrollEnabled` + `keyboardShouldPersistTaps="handled"` on the transcript `ScrollView`.
- **2026-05-29** *(R5)* — Mobile AI model picker was UI-only: it persisted `{vendor, model}` to AsyncStorage but never sent it to the API, so `/generate` and `/voice/summarize` always ran the server default regardless of what the user picked. Picker tests mocked AsyncStorage; `/generate` tests always supplied explicit overrides — default wiring untested. Fix: `/settings/ai` becomes the single source of truth (contract whitelist `AI_MODELS`, paired-nullable shape); routes read user pick via `getAiSettings()` and pass `userVendor`/`userModel` into `runGenerate()` + `aiSummarize()`; mobile `useAiProvider` rewritten as TanStack Query reader/writer; Developer screen becomes single-step picker with leading "Default" row that clears the override; live test asserts `result.model === 'gpt-4.1-mini'` end-to-end. [detail](2026-05-29-mobile-model-picker-dead-wired.md)
- **2026-05-29** *(R5)* — Generate Report on `harpa-pro-api-dev` took 47–87s end-to-end because the canonical was pinned to `kimi-k2.6`, a reasoning model that emits chain-of-thought tokens before the JSON. Bench against the real REPORT_SYSTEM_PROMPT showed gpt-4o p50=5s, groq/llama-3.3-70b p50=1.4s. Fix: pin canonical to `openai/gpt-4o`; update `record.ts` canonical request literals to match; re-record voice-{1..5} fixtures; hand-patch + rehash `generate-report.update.json`; switch the live test from `KIMI_API_KEY` to `OPENAI_API_KEY` and lower `vitest.live.config.ts` timeout from 180s → 60s. [detail](2026-05-29-kimi-k26-too-slow-for-report-generation.md)
- **2026-05-29** *(R5)* — Generate Report still 502'd after the vendor-routing fix because the canonical model `kimi-k2-0520` isn't on the Moonshot account behind our `KIMI_API_KEY`; logs flipped to `[ai-fixtures:kimi] HTTP 404`. The `/models` probe shows only `kimi-k2.5`, `kimi-k2.6`, `moonshot-v1-*`. Fix: pin canonical to `kimi-k2.6`; fix `record.ts` to hash the canonical vendor/model (was writing `openai`/`gpt-4o` into the request hash, so script and runtime never matched); re-record + rehash the report fixtures. [detail](2026-05-29-kimi-canonical-model-not-on-account.md)
- **2026-05-29** *(R5)* — Generate Report 502'd in dev: commit `e4c503a` switched the report canonical to `kimi/kimi-k2-0520` but only patched **replay** mode to force `providerVendor = canonicals.vendor`; live mode kept routing to the caller's `settings.vendor` (defaults to `openai`), so OpenAI got the Kimi model name and 404'd. The live test stubbed `vendor: 'kimi'` directly, masking the default-wired path. Fix: pin `providerVendor` to canonicals in both modes; drop the stub from the live test so the default vendor resolution is exercised. [detail](2026-05-29-report-vendor-canonical-mismatch.md)
- **2026-05-29** — Files RLS too tight: `files_owner_all` blocked cross-member dereference, so teammates 404'd on every attachment they didn't upload themselves. Fix: migration 0011 splits the policy into `files_member_read` + `files_owner_insert` + `files_member_write` / `files_member_delete`; project-scoped files inherit `app.is_member(project_id)` while avatar/scratch (`project_id IS NULL`) stay owner-only. Recurrence guard: any new project-scoped table must split SELECT/INSERT/UPDATE/DELETE rather than reach for `FOR ALL` owner-only.
- **2026-05-28** *(R5)* — Inverse of 2026-05-23: while realigning prompts to v4, the `meta` envelope (title, summary, visitDate, tags) was dropped from `reportBody`; mobile UI title/summary surfaces silently rendered empty. Fix: restore a slim meta envelope in contract + prompts + drift guard + adapter + UI; expand drift guard to positively require meta keys.
- **2026-05-28** *(R5)* — Generate Report Debug tab showed "no prompt / no input / no response" on cold load because the route fed `lastGeneration` from a `useState` populated only by the mutation `onSuccess`; persisted `app.reports.last_generation` was never queried in-page. Fix: hydrate via `useReportDebugQuery` (gated on dev flag) + invalidate `reportDebug` on (re)generate. [detail](2026-05-28-debug-tab-lastgeneration-not-hydrated.md)
- **2026-05-24** — Android back-to-exit fired on every nested screen because layout `useNavigation().canGoBack()` returns the parent navigator. Fix: use `router.canGoBack()`. [detail](2026-05-24-android-back-double-press.md)
- **2026-05-23** *(R5)* — Generate Report 502'd in dev: prompt still asked for v3 JSON envelope while contract validated unwrapped v4 `reportBody`; replay fixtures masked it. Fix: rewrite both report prompts to v4 field names + add live-LLM CI lane. [detail](2026-05-23-report-prompt-v3-v4-drift.md)
- **2026-05-22** *(R5)* — `pickStorage()` read raw `process.env.R2_FIXTURE_MODE` while the rest of the module read parsed `env.R2_*`; trapdoor for live-vs-replay drift. Fix: branch on `env.R2_FIXTURE_MODE` + MinIO Testcontainers default-wiring test. [detail](2026-05-22-pickstorage-process-env-trapdoor.md)
- **2026-05-22** *(R-Maestro1)* — Every `.maestro/*.yaml` hardcoded `appId: com.harpa.pro`, so dev-variant runs would have hit the prod bundle. Fix: parameterise via `${MAESTRO_APP_ID}` + lint guard against literals. [detail](2026-05-22-maestro-appid-hardcoded.md)
- **2026-05-22** *(R5)* — `AI_LIVE=1` shipped to prod but every call went to replay: `pickMode(fixtureName)` short-circuited whenever the caller passed a derived default name, which every caller did. Fix: only force replay when the *external* caller passes a name. [detail](2026-05-22-ai-live-pickmode-dead-code.md)
- **2026-05-20** *(R7)* — Prod `/healthz` 200'd while every DB route 500'd: Neon prod branch had never been migrated and the health check was a static literal. Fix: Fly `release_command` runs migrations + `/readyz` opens a real connection and checks migration head. [detail](2026-05-20-healthz-static-literal-prod-down.md)
- **2026-05-18** *(R5)* — Saved-report route rendered "Failed to load report" because `reportBodyToGeneratedReport()` was applied on the generate route but not the saved-report route. Fix: apply the adapter at every consumer + cover with Maestro flow against the real API. [detail](2026-05-18-saved-report-body-adapter-missing.md)
- **2026-05-18** — `expo-camera` crashed boot on dev-clients whose native binary predated the JS addition: top-level `requireNativeModule('ExpoCamera')` blew up at module eval. Fix: lazy `lib/native/expo-camera-shim.ts` with fallback UI. [detail](2026-05-18-expo-camera-native-module-missing.md)
- **2026-05-18** — Maestro tapOn against `Pressable` inside an RN `<Modal>` reports COMPLETED on iOS XCTest but never fires `onPress`. Workaround: assert visibility only; cover the action in a unit test; prefer inline overlays for testable destructive sheets. [detail](2026-05-18-maestro-modal-pressable-tap.md)
- **2026-05-17** *(R5)* — Invite-member form auto-closed on submit, hiding the API error, because `if (!addError) setShowAdd(false)` read stale state in the event handler. Fix: drive the close from the route via an `addSuccessNonce` effect. [detail](2026-05-17-invite-form-auto-close-on-error.md)
- **2026-05-17** *(R5)* — "Edit manually" switched tabs but left an empty Edit tab: route never passed `onSetReport`, so `editManually`'s seed-empty-report fallback short-circuited. Fix: wire `onSetReport={setGeneratedReport}` from the route. [detail](2026-05-17-edit-manually-missing-onsetreport.md)
- **2026-05-15** *(R5)* — Every lucide icon rendered as the brand placeholder because `react-native-svg` peer dep was never installed; unit snapshots passed since SVG primitives aren't resolved. Fix: `expo install react-native-svg` + screenshot smoke flow. [detail](2026-05-15-lucide-icons-react-native-svg-missing.md)
- **2026-05-15** *(R5)* — `/auth/logout` deletes the session row but the JWT keeps authenticating: `withAuth()` only checks signature/expiry, not `auth.sessions`. Test asserted DB deletion, not the contract. Fix pending: validate `sid` against `auth.sessions` (or move to opaque tokens). [detail](2026-05-15-logout-jwt-not-revoked.md)
- **2026-05-15** *(R6)* — `auth.test.ts > rejects a tampered token` flaked ~6%: flipping the final base64url char of an HS256 signature is a no-op when chars share top-4 bits (A↔B↔C↔D). Fix: tamper the payload segment instead — every bit is significant. [detail](2026-05-15-auth-tampered-token-base64-flake.md)
- **2026-05-14** *(R5)* — Waitlist returned 202 with empty DB: `fakeTurnstile()` only accepted `tt-…` tokens while the real widget emits Cloudflare-format tokens; every test stubbed Turnstile so the default factory was untested. Fix: accept any non-empty token + default-wiring integration test. [detail](2026-05-14-fake-turnstile-magic-token.md)
- **2026-05-13** *(R4)* — Colocating `_layout.test.tsx` inside `app/` pulled `vitest` → `@vitest/runner/utils` → `chai` into the Metro bundle and crashed every screen at runtime. Fix: move tests under `apps/mobile/__tests__/...`; prefix non-route helpers with `_`. [detail](2026-05-13-vitest-leak-via-colocated-tests.md)
- **2026-05-13** *(R2)* — `.js` extensions in mobile relative TS imports re-broke Metro bundling; reintroduced by hand-written modules mirroring the API style and by the `gen-hooks.ts` template. Fix: strip `.js` everywhere under `apps/mobile/**` + fix the generator. [detail](2026-05-13-mobile-js-extension-relative-imports.md)
- **2026-05-13** *(R3)* — `AppLayout` crashed with "Rendered fewer hooks than expected" when the auth gate flipped: `useEffect` lived below an early `<Redirect />`. Fix: hoist all hooks above any conditional return + re-render test across auth transitions. [detail](2026-05-13-app-layout-hook-order-auth-gate.md)
- **2026-05-12** *(R1)* — Hono v4 `onError` only runs for `Error` instances; non-Error throws (`throw 'oops'`, `throw 42`, …) bypass `errorMapper` entirely. Fix: no code change; property test narrows to Error subclasses and pins the limitation. [detail](2026-05-12-hono-onerror-non-error-throws.md)
