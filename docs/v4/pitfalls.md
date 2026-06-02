# v4 Pitfalls — what went wrong in the v3 attempt and the rules we adopt

> **Read this first.** Every rule below maps to a specific painful
> commit on the `mobile-v3` branch of `../haru3-reports`. The whole
> point of the v4 rewrite is to not repeat these.

This document is the source for the "Hard rules" section in
[`AGENTS.md`](../../AGENTS.md). Keep them in sync — a new pitfall
means a new rule there too.

---

## Pitfall 1 — "P1 done" without real API tests

**What happened.** v3 P1 (commit `e7fce47`) declared the API "done"
with handlers + auth + rate limiting in place. Months later we
shipped:

- `672ab33 feat(api): implement all 8 stubbed P1 API routes` — eight
  endpoints were actually still stubs.
- `4d20395 test(api): expand route validation tests — 104 → 162`
- `00f139d fix(api): resolve mock-ai type inference errors`
- `99f4ef1 test(P7): add API contract tests (56 tests)`
- `f11b3d9 feat(api): enforce RLS via per-request scoped Postgres connections`

i.e. the API **didn't actually work end-to-end** until P7 retro work.

**v4 rule.** P1 has a hard exit gate:

- 100% of routes implemented (no stubs in `app.routes.ts`).
- ≥ 90% line coverage on `packages/api/src/`.
- Testcontainers integration tests for every route, hitting real
  Postgres. Per-request scope tests for every authenticated route.
- Contract tests verifying `api-contract` matches the live OpenAPI
  spec generated from Hono.
- No real LLM calls in CI. All AI calls go through `ai-fixtures`.

P1 is not "done" until `pnpm test:api && pnpm test:api:integration`
both pass at the coverage gate. The CI workflow blocks merge.

---

## Pitfall 2 — LLM fixtures retrofitted, not designed-in

**What happened.** Mock AI was added in `0cfccbe` (P5.3) and broke
several times (`00f139d` fixed type inference). The `:mock` build
mode was bolted on later via `EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE`.

**v4 rule.** `packages/ai-fixtures` is the **first thing** we build
in P0 (P0.5), before any real LLM call exists. Every provider client
is constructed via `createProvider({ fixtureMode })`. Modes:

- `record` — hits the real provider, writes a fixture JSON to
  `packages/ai-fixtures/fixtures/<name>.json`, redacted via a
  schema. Used by `pnpm fixtures:record <name>`.
- `replay` — reads the fixture; if missing, throws. Used in tests
  and `:mock` builds.
- `live` — only enabled by `AI_LIVE=1` in production deploys.

CI sets `AI_FIXTURE_MODE=replay` and asserts no `live` calls.

---

## Pitfall 3 — Mobile shell drifted from the visual design

**What happened.** v3 P2 (`284f6b1`) shipped "design system + auth +
navigation" but with bespoke styling. Later commits had to re-do
visual parity:

- `4675602 fix(mobile-v3): UI parity with v2 — tokens, components, screens aligned`
- `7650c59 feat(mobile-v3): P4.2 UI polish — tokens, component fixes`
- `7919550 feat(mobile-v3): P4.2.4 screen polish`
- `b87c598 fix(mobile-v3): P4.3 consistency fixes — SafeAreaView, spacing.screen, memo, testIDs`
- `48c5dee feat(mobile): standardize icon-only buttons with shared IconButton primitive`
- `1ec0fc8 fix(mobile-v3): center text vertically in Input`
- `0f3db66 refactor(mobile): tighten typography scale`
- `db0b97c fix(mobile-v3): add small top padding to ScreenHeader`
- `69ebf4e fix(mobile-v3): add back button to profile and fix onboarding placeholder spacing`

The whole v3 realignment effort
([`docs/legacy-v3/realignment/`](../legacy-v3/realignment/)) exists
because of this drift.

**v4 rule.** P2 ships screens by **direct port from the canonical
source** at `../haru3-reports/apps/mobile` on branch `dev`. Both
sides run NativeWind v4 — JSX and Tailwind classes copy across with
no translation. Visual review is manual (side-by-side with the
canonical source on the iOS sim). Cosmetic drift in later phases is
a P0 bug.

There is no automated screenshot-diff gate — the v3 attempt's
`docs/legacy-v3/screenshots/`, `docs/legacy-v3/realignment/`, and
`docs/legacy-v3/_work/mobile-old-source-dump.md` are explicitly
**not** used as port sources in v4 (they are kept for historical
context only).

Tactical sub-rules:
- Tailwind tokens defined in `apps/mobile/tailwind.config.js` once,
  derived from the canonical source's `tailwind.config.js`. No hex
  values in screen code (ESLint rule `no-restricted-syntax` scoped to
  `components/**` in `apps/mobile/.eslintrc.cjs`).
- Shared primitives (`Card`, `Input`, `Button`, `IconButton`,
  `ScreenHeader`, `EmptyState`, `Skeleton`, `AppDialogSheet`,
  `StatTile`) ship in P2.2 with snapshot tests. Adding a new
  one-off primitive is a code-review block.
- Every screen wraps a single body component in
  `apps/mobile/screens/<name>.tsx` mounted by its real route under
  `(auth)/` or `(app)/` (wired in P3). Bodies are props-driven (no
  API/auth inside) so they are unit-testable in isolation.

---

## Pitfall 4 — Big features stubbed, then forgotten

**What happened.** Camera + voice pipelines were "scaffolded" in P3
but actually wired in `672ab33` (months later). The Notes-tab
composer, report rendering cards (`StatBar`, `WeatherStrip`,
`IssuesCard`, `WorkersCard`, `MaterialsCard`, `NextStepsCard`),
PDF actions menu, `PdfPreviewModal`, and `SavedReportSheet` were
**all missing** from v3 and only ported back in `78f01be feat(mobile):
restore full v3 report note-taking parity` after a manual gap audit.

**v4 rule.** Each P3 task = **one screen, fully working, with a
Maestro flow**. We do not move to the next screen until the current
one passes:

- Manual visual review against the matching screen in
  `../haru3-reports/apps/mobile@dev` (side-by-side simulator check).
- Vitest behaviour test for every interaction the canonical source
  exercises.
- Maestro flow exercising the screen end-to-end (record + replay
  fixtures for any AI call).

The acceptance contract for P3 is the matching screen in the
canonical source at `../haru3-reports/apps/mobile@dev`.

---

## Pitfall 5 — Auth glue done late, env handling brittle

**What happened.**

- `960cf76 fix(api): use JWKS verification for Supabase JWTs` —
  basic JWT verification was wrong until P6.
- `892b1eb fix(mobile-v3): remove setTimeout race in OTP verify, fetch profile inline`
  — OTP flow had a race condition.
- `55cff0b` / `8197342` — onboarding routing fix, then revert.
- `3b50499 fix(mobile): drop non-null assertions on EXPO_PUBLIC_* env`
  — every screen was using `process.env.X!` and crashing at runtime
  when the var was missing.
- `9c65a36 docs(testing): document EXPO_PUBLIC env var requirement
  for Android release builds` — discovered in production.

**v4 rule.**

1. Auth ships in P0.6 with a working email-OTP flow via Resend
   (`EMAIL_OTP_LIVE=1`) **before** any other API route. P1's first task is "auth
   middleware + integration tests".
2. `apps/mobile/lib/env.ts` is a Zod-parsed object loaded at app
   boot. ESLint forbids `process.env.EXPO_PUBLIC_*` outside that
   file. CI runs the parse against a populated `.env.example` to
   catch missing vars before merge.
3. OTP verify uses a single async function (`await verifyOtp`,
   `await fetchProfile`, then `router.replace`). No `setTimeout` in
   auth flows. Lint rule: `no-restricted-syntax` for `setTimeout`
   inside `app/(auth)/`.

---

## Pitfall 6 — Per-request DB scope (RLS replacement) added late

**What happened.** v3 used Supabase RLS, but the API still proxied
queries with the service role early on. RLS was retrofitted via
`f11b3d9 feat(api): enforce RLS via per-request scoped Postgres
connections` — late, with no integration test coverage of the bypass
risk.

**v4 rule.** Because we host on Neon (no built-in RLS that survives
API-level service-role queries), all DB access uses
`withScopedConnection(actorClaims, async (db) => …)`, which:

- Acquires a connection from the per-request pool.
- Runs `SET LOCAL role = '<scoped_role>'` and
  `SET LOCAL app.user_id = '<jwt sub>'`.
- Releases the connection on completion / error.

Every authenticated route has a pair of integration tests:

- "actor X can read/write their own row".
- "actor X cannot read/write actor Y's row" — this MUST fail without
  the scope wrapper, proving the wrapper is the thing protecting it.

A lint rule (`no-restricted-imports` for raw `db` in route handlers)
forbids unscoped DB access in the routes layer.

See [`docs/v4/arch-auth-and-rls.md`](arch-auth-and-rls.md).

---

## Pitfall 7 — Date / time formatting bugs in production

**What happened.** `b78f012 fix(mobile): parse Postgres timestamptz
textual format in date formatter` — the API returned PG's textual
timestamp; the mobile date formatter assumed ISO-8601, silently
returned "Invalid date" in some locales.

**v4 rule.**

- API serialises all timestamps as ISO-8601 strings via a single
  Zod transform in `api-contract`. No raw PG textual timestamps over
  the wire.
- `apps/mobile/lib/date.ts` is a single module with full unit test
  coverage of every format used in the UI (relative time, short
  date, long date, time-of-day) — and a regression test for the
  PG textual format ("just in case").

---

## Pitfall 8 — Upload pipeline missed timeline integration

**What happened.** `3e6e7ac fix(mobile): auto-create timeline note
for image/document uploads` — uploads went through but didn't show
up as timeline entries. Caught manually.

**v4 rule.** The upload pipeline contract:

```
queue.enqueue(file, { kind: 'image' | 'voice' | 'document', noteContext })
  → presign        // API
  → PUT to R2      // direct
  → createFile     // API
  → createNote     // API — ALWAYS, even for documents
  → invalidate(reportNotes)
```

is exercised by an integration test `upload-creates-timeline-note.test.ts`
that runs for **all three kinds**. New kinds added → new test row.

---

## Pitfall 9 — Maestro flows broken by bundle ID change

**What happened.** `1a2ac90 fix(maestro): update appId to
com.harpa.pro.v3 in all flows` — `.maestro/` flows had hardcoded
`com.harpa.pro` and silently failed on v3.

**v4 rule.** `appId` is a single environment variable
(`MAESTRO_APP_ID`) read by every flow via `${MAESTRO_APP_ID}`.
A pre-test grep in `pnpm test:e2e` fails if any flow file contains
a literal `com.harpa.*` instead of the variable.

---

## Pitfall 10 — Coverage / docs / tests in "P5/P6/P7" instead of inline

**What happened.** Everything got punted: tests in P5, docs in P6,
removal in P6.4, rename in P6.5. End result: weeks of cleanup,
broken cross-references, dead code.

**v4 rule.**

- Every PR ships its own tests + docs + cleanup. There is no "test
  phase" or "docs phase" in v4.
- The phases (`docs/v4/plan-p*.md`) describe **what features
  exist by the end of the phase**, not "tests / polish / cleanup
  to be done later".
- "Done" means: feature in app, tests pass, coverage gate met,
  docs updated, dead code removed.

---

## Pitfall 11 — Hermes/RN globalThis.crypto missing

**What happened.** Hermes release builds on iOS don't expose
`globalThis.crypto`, so any `crypto.randomUUID()` fallback that
returned `<time>-<rand>` got into Postgres `uuid` columns and
silently broke PostgREST.

**v4 rule.** `apps/mobile/lib/uuid.ts` is the only UUID source.
It uses `expo-crypto`'s `randomUUID()` and asserts RFC-4122 shape.
Lint rule forbids `crypto.randomUUID()` and template-string fallbacks.

---

## Pitfall 12 — `Alert.alert` used for app dialogs

**What happened.** `Alert.alert` snuck into camera and FilePicker —
violated the AGENTS.md rule. Caught by manual review, fixed late.

**v4 rule.** ESLint rule `no-restricted-imports` blocks importing
`Alert` from `react-native` outside `apps/mobile/lib/dialogs/`.
Use `useAppDialogSheet()` everywhere else.

---

## Pitfall 13 — DI stubs become the spec; default wiring silently broken

**What happened.** The marketing waitlist form returned 2xx in the
browser but `app.waitlist_signups` stayed empty. Root cause:
`fakeTurnstile()` accepted only tokens starting with `tt-`; the
real dev widget emits `XXXX.DUMMY.TOKEN.XXXX` (Cloudflare test
key). 16 integration tests were green because every single one
called `setWaitlistClients({ turnstile: alwaysOkTurnstile() })` —
the production-fake factory was never exercised. Captured in full
as [Pattern R5](../bugs/README.md#r5--di-stubs-become-the-spec-default-wiring-silently-broken).

**v4 rule.** Three layered defences, in order of cheapness:

1. **Cover the default factory in integration tests.** For every
   `createXClient()` factory, at least one route-level test calls
   the route WITHOUT injecting that collaborator and asserts the
   real side-effect (DB row, queued email, recorded fixture call).
   The "always-OK" stub is for negative-path tests, not the spec.
2. **Fake-mode helpers accept what the real dev surface produces.**
   `fakeTurnstile`, fake-R2, fake-Resend should behave
   on the inputs the local widget / dev surface actually sends.
   Magic token shapes (`tt-…`) are a test-only convention; if a test
   wants the failure branch, it injects `alwaysFailX()`, not a token
   the dev path can't generate.
3. **One browser/device E2E per critical user flow.** Playwright
   for `apps/marketing`, Maestro for mobile. Drives the live form
   against the live compose stack, asserts the persisted side-effect
   (`SELECT count(*) FROM app.waitlist_signups WHERE email = …`).
   This is the only test type that proves env wiring, CORS, real
   widget output, and the default factory all hang together.

The recurring-bugs log entry is the search hit for "I'm about to
add another stub" — see [docs/bugs/README.md → R5](../bugs/README.md#r5--di-stubs-become-the-spec-default-wiring-silently-broken)
before you write `setXClients({ … })`.

**Sub-pattern — `pickStorage()` (and other env-derived factory
selectors) must read the parsed `env` const, not `process.env`
directly.** During the camera-upload audit we found
`pickStorage()` was branching on `process.env.R2_FIXTURE_MODE` while
every other line in the same module read `env.R2_*`. The default
factory therefore made the live R2 selection on the *raw* env value,
which silently disagreed with the Zod-parsed view used by
`R2Storage`'s constructor — a textbook layer-1 trapdoor that no
unit test would catch. Two defences shipped together:
`scripts/check-no-process-env-r2.sh` (lint-time grep guard, scoped
to all of `packages/` + `apps/`) and a MinIO-via-Testcontainers
integration test (`files.r2-live.integration.test.ts`) that
exercises the real default wiring against a live S3-compatible
endpoint — no DI stubs, no fake clients, just the route + its
collaborators against MinIO.

---

## Process pitfalls

### "Realignment" is the smell

The fact that v3 needed a 17-page realignment plan
([`docs/legacy-v3/realignment/`](../legacy-v3/realignment/)) means
we were declaring phases done without a real acceptance contract.
v4's acceptance contract is the live canonical port source at
`../haru3-reports/apps/mobile@dev` — read it directly per screen;
do **not** mine the legacy realignment docs.

### Subagent over-scoping

v3 commits like `feat(mobile-v3): P3.8 — provider wiring, utilities,
107 unit tests (96% coverage)` are too big — one commit, three
features, hard to review. v4 commits target **one screen / one route
/ one primitive** each.

### Don't strip features mid-rebuild

`5676578 refactor(mobile-v3): strip manual edit tab pending redesign`
— removing scope mid-flight to ship faster left a hole. v4 rule:
either include the feature in scope, or write a `feat-flag` that
hides it from prod but keeps the code path exercised by tests.
Don't `// TODO redesign` in user-visible places.

---

## Pitfall 14 — CLI / contract path drift

**Symptom:** CLI builds fail with TS2345 "type X is not assignable to
`PathsWithMethod<paths, ...>`" or runtime 404s on endpoints that the
API clearly exposes. Cause: API routes were renamed (UUID → slug,
flat → nested) but the CLI commands still reference the old paths.
`openapi-typescript` regenerates `paths` from `openapi.json`, so the
CLI compiler is the only place this surfaces — until you ship it.

**Rule:**

1. When you change a route shape in `packages/api/src/routes/*`, run
   `pnpm --filter @harpa/api spec:emit && pnpm --filter @harpa/api-contract gen:types`
   in the same commit.
2. Build the CLI (`pnpm --filter @harpa/cli build`) in CI on every
   API-route diff — it's the contract consumer that catches drift.
3. Don't keep two ways to identify a resource. The API picked
   `projectSlug` + `number` for reports; the CLI accepts the same
   positionals (`<projectSlug> <number>`), not legacy `<reportId>`.

**Diagnosis crib:** if `openapi-fetch` complains the path literal
isn't in `PathsWithMethod`, grep the generated types
(`packages/api-contract/src/generated/types.ts`) for the resource
prefix — the spec is the source of truth.

## Pitfall 15 — Route handlers that ignore user settings

**Symptom:** Per-user setting (AI vendor, locale, …) appears to be
saved (`GET /settings/ai` returns the new value) but observable
behaviour doesn't change — every report still hits the openai
fixture, every email still ships in English.

**Cause:** The handler reads the request body but never calls
`getXxxSettings(db, userId)`. The setting is dead weight in the DB.

**Rule:** When a route's output depends on a per-user preference,
load that preference in the same handler that does the work and
pass it explicitly into the service. Don't rely on a default
parameter — the default *is* the bug.

`packages/api/src/routes/reports.ts::runGenerate` is the canonical
shape (loads `getAiSettings(d, userId)`, forwards `vendor` to
`aiGenerateReport`). Mirror it for any new "per-user-tunable"
behaviour.

---

## Pitfall 16 — Derived fallback fixture name silently disables AI_LIVE

**Symptom:** `AI_LIVE=1` ships to prod, secrets are set, deploy is
green — but no request ever reaches `api.openai.com`. The provider
keeps replaying canned fixtures.

**Cause:** `packages/api/src/services/ai.ts::pickMode()` took a single
`fixtureName` argument and short-circuited to `'replay'` whenever any
fixture name was set. The three callers (`transcribe`, `chat`,
`generateReport`) each derived a sensible default (`summarize.basic`,
`transcribe.basic.groq`, …) and passed it in *unconditionally* — so
the function always saw a fixture name, and `AI_LIVE=1` was dead
code. A unit-style test that called `chat({ userPrompt: 'x' })`
without a fixtureName would have caught it; we only had tests that
asserted *replay* behaviour and passed fixture names through.

**Rule:** When a function takes "the caller's intent" as an argument,
never mix it with values you derive internally. Either:

- Split into two functions ("did the caller ask for X?" vs "what's the
  default for X?"), or
- Pass `undefined` through and only fill the default after the
  routing decision is made.

**Test rule (Pitfall 13 corollary):** every "AI_LIVE flips the wiring"
flag needs a positive test that boots the service *without* a caller
fixture name, stubs `globalThis.fetch`, and asserts the request URL
hits the live vendor. We added
`packages/api/src/services/ai.live.test.ts` for exactly this — it
catches the next regression in this shape.

---

## Pitfall 17 — State-conditional wrappers cause skeleton → content layout shift

**Symptom:** A screen renders a skeleton while `isLoading`, then on
hydrate the page visibly jumps — the header is in the same place but
the first row, a CTA, or a section title pops in/out and shoves
everything down.

**Cause:** The loaded JSX wraps some element in `!isLoading && (…)`
(or only renders an action button when data is present), but the
skeleton tree doesn't reserve that space. The classic offender in v4
was `apps/mobile/screens/reports-list.tsx` rendering the "New report"
Pressable as `canCreate && !isLoading ? (…)`, so the Pressable
appeared after load and pushed the list down ~88 px.

**Rule:** A screen's outer scaffold (SafeAreaView, header, list
container, CTA, surrounding padding) must be **identical** in
`isLoading` and loaded states. The only thing that swaps is the
inner content region. If a control must be disabled during load,
render it disabled — do not unmount it.

**Test rule:** Use `useLayoutShiftProbe` (`apps/mobile/lib/layout-shift-probe.ts`)
on landmark nodes in both the skeleton and the loaded tree with the
same id. In dev, set `EXPO_PUBLIC_LAYOUT_PROBE=true` and call
`dumpShiftReport()` — every landmark must have `maxDeltaY ≤ 2 px`.
The eight v4 skeletons (`apps/mobile/components/skeletons/*`) and
their screens follow this pattern; mirror it for any new screen with
a loading state. See [`arch-mobile-skeletons.md`](./arch-mobile-skeletons.md).

## Testing

- Maestro on Windows / PowerShell 7 against real Android has its own
  set of host- and CLI-specific pitfalls — see
  [`pitfalls-maestro-windows.md`](pitfalls-maestro-windows.md).

---

## Pitfall 18 — Timeline rows flicker on pending → saved transition

**What happened.** Photo notes flickered visibly on upload: the
pending preview card disappeared and a fresh saved card appeared
~1 frame later. Root cause was React keys changing across the
transition. `NoteTimeline` keyed image rows by `entry.id`. While
the upload was in flight, the synthetic `NoteEntry` had id
`__batch-<key>` (or `__upload-<jobId>`). When the server confirmed
the note, the saved row arrived with `not_<id>` — a different key,
so React unmounted the pending card and mounted a new saved card.
Solo uploads compounded it because the rendered component also
changed (`PendingPhotoCard` → `PhotoNoteCard`).

Voice notes did not flicker because their synthetic row adopts the
real `savedNote.id` once known, and the pending row stays mounted
until `notes` contains a row with the matching id.

**Rule.** Synthetic timeline entries must adopt a stable React key
that survives the pending → saved transition. Implementation:

1. Plumb the resolved `noteId` through the upload queue as soon as
   `createNote` / `resolveNote` returns (during `creating_note`,
   BEFORE `completed`). Surface it on the job snapshot.
2. The hook that synthesises `NoteEntry` rows owns a session-lived
   `noteId → syntheticId` map so server rows that arrive on later
   refetches still resolve to the original key.
3. Server `NoteEntry` rows carry a separate `reactKey` field — DO
   NOT overwrite `id`. Downstream mutations (delete, edit, photo
   gallery indexing) all key on `entry.id`; only the timeline
   renderer consumes `reactKey`.
4. One component must handle the full lifecycle (pending →
   uploading → failed → saved → mixed). Splitting pending and saved
   into separate components reintroduces the unmount/remount even
   when the key is stable, because React swaps component types.

**Test rule.** Pin the contract with a key-stability test that
renders the timeline with a pending row, swaps it for the saved row
with the same `reactKey`, and asserts the host node identity is
preserved (`expect(after).toBe(before)`). Include a negative
control that changes `reactKey` and verifies a new instance is
created — this catches a future regression in the timeline's key
selection. See `apps/mobile/components/notes/NoteTimeline.test.tsx`.

---

## Pitfall 19 — Timer-based regen polls waste battery and drift from truth

**What happened.** Early designs proposed a periodic timer that polls
the server and regenerates if notes have changed. Timers fire
regardless of actual state (waste), create UX jank if the AI call
lands while the user is reading, and are hard to test (timing
non-determinism).

**Rule.** Use the DB-backed `needsRegeneration` flag exposed in the
report contract. The flag is set server-side by note CRUD (not by a
timer or a mobile counter); mobile reads it on every React Query
refetch and fires the hook exactly once. Manual body edits do NOT
touch `notes_changed_at` so they never trigger auto-regen.

**Test rule.** The `useAutoRegenerate` hook has 6 unit tests (all
gate conditions) plus a default-wiring screen test that renders the
provider and asserts the action-row state without stubbing the hook.
See `apps/mobile/features/generate/useAutoRegenerate.test.tsx` and
`apps/mobile/screens/generate-report-tab.test.tsx`.

---

---

## Pitfall 20 — better-auth session validation order in tests

**Symptom.** `withAuth` returns 401 for valid sessions when
`auth.api.getSession()` is called before the connection pool is
initialised, or when the bearer token is a refresh token / any
non-session string.

**Cause.** better-auth validates the token hash against the
`public.session` table using the unscoped pool (`rawDb()`). If the
pool is not yet initialised (e.g. `resetPool()` not called before the
first `signTestSession` in integration tests), `getSession` silently
returns `null` and `withAuth` throws 401.

**Rules.**

1. In integration test setup always call `resetPool()` **before**
   using `signTestSession`. The canonical helper order is:
   ```ts
   beforeAll(async () => {
     await resetPool(container.connectionString);
     token = await signTestSession(userId, sessionId);
   });
   ```
2. `signTestSession` inserts a real row into `public.session` and
   returns the session token that better-auth minted. Never forge a
   session by constructing an arbitrary string — better-auth compares
   the SHA-256 hash of the token against `public.session.token`.
3. In production, opaque bearer tokens issued by better-auth are
   self-consistent. Do not attempt to decode or re-sign them with a
   custom key; only `auth.api.getSession({ headers })` is the
   authoritative validator.

---

## How we use this doc

When you finish a task and notice the bug shape matches one of these
pitfalls, **link the pitfall ID in the commit body**. Reviewers
should reject PRs that touch the same surface without addressing the
relevant pitfall rule.

When a NEW pitfall surfaces (a recurring bug, a "wait, why is this
still stubbed?" moment), add it here in the same PR. This doc is
append-only except for clarifications.
