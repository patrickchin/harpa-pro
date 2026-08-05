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
2. Fake-mode helpers (`fakeTurnstile`, `fakeR2`, fake-Resend) accept
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

### R10 — Native-module option literals drift from SDK constants

Handwritten platform-specific option strings can look harmless in JS
tests while native code interprets them as low-level constants. Fixture
recorders, simulators, and non-native unit tests stay green because
they never exercise the actual bridge path. Mitigation: derive native
option objects from the SDK's presets/constants where possible, export
and unit-test the final options object, and keep real-device/TestFlight
smoke coverage for option surfaces that affect native encoders,
permissions, or audio sessions.

## Entries

### R6 — owner-demotion via re-invite (implicit upsert on POST /members)

A `POST /projects/{project}/members` handler that uses `INSERT … ON CONFLICT DO
UPDATE` (upsert) lets an owner call the endpoint with their own email
and a lower role (`viewer`, `editor`), silently demoting themselves. If they
are the sole owner this locks the project out of all owner-only operations
(member management, project delete) with no recovery path short of a DB patch.

**Protection.** `app.add_project_member_by_email` uses an explicit `IF EXISTS`
guard and raises `23505` ("already_member") mapped to 409 `MEMBER_EXISTS`.
Role changes must go through `PATCH /projects/{project}/members/{user}` (a
separate, explicitly guarded endpoint). Full design in
[`docs/v4/arch-project-members.md`](../v4/arch-project-members.md).

**Test that must exist.** S3 in the members integration suite: owner A calls
`POST` with their own email → asserts 409 `MEMBER_EXISTS`, then confirms
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

### R8 — Wildcard injection through `LIKE` on user-supplied input

A helper that does `WHERE col LIKE '%' || $1 || '%'` against an input
that flows straight from a JSON body / query string is a wildcard
injection vector even though the SQL itself is parameterised:
parameterisation only stops *syntactic* injection. A single request
with `$1 = '%'` matches every row; a request with a substring of a
real value matches any row whose key happens to contain it
(`alice@e.com` matches `bob+alice@e.com.evil`). Recurrence vectors:

1. Test / dev introspection helpers that reach for `LIKE` because the
   author has only the email half of the stored key and doesn't know
   (or hasn't checked) the prefix the framework actually wrote.
2. "Safe enough" because the route is behind a `NODE_ENV !==
   'production'` gate — but a single mis-set Doppler variable, a
   `HARPAPRO_PR_BUILD='1'` typo on prod, or a future build that ships
   dev code by accident exposes it.

Mitigation: construct the full key server-side and exact-match
(`WHERE identifier = 'sign-in-otp-' || $1`); if the schema makes that
impossible, escape `%` and `_` in the input before concatenation AND
treat the route as if it were public — shared-secret header,
allowlist regex on the input shape, audit log, uniform 404. See
[Pitfall 20](../v4/pitfalls.md#pitfall-20--dev-only-routes-need-defence-in-depth-not-a-node_env-gate).

### R9 — Two layers, both correct, fight each other

Two independently-defensible behaviors compose into a cycle that
ratchets away user intent. Classic shape: layer A writes a value;
layer B "self-heals" what it thinks is a stale value; the
self-heal trigger is fired by A's write, so B undoes A every time.
Each layer's tests pass in isolation because each is tested
without the other.

Mitigation:
- When a UI feature attaches *metadata* to a content row that
  also drives any "content has changed → regenerate" plumbing,
  the metadata path **must be explicitly carved out** of that
  plumbing (no `bumpNotesChangedAt`, no `report` invalidation,
  etc.). Document the carve-out in the design doc *and* lock it
  in with an inverse assertion ("does NOT bump …").
- Any "self-heal" effect that deletes user input on mount must be
  paired with a render-pipeline test proving it *doesn't* fire
  on the happy path, not just that it fires on the orphan path.
- Prefer storing placement in the composed document it affects when
  the user-visible behavior is document layout. The v2 photo-placement
  model stores image note ids in `report.body.*.attachments.images[]`
  and sanitizes invalid ids server-side; the client no longer needs
  an orphan-clearing effect.

### R11 — Fake-mode convenience logs leak bearer secrets

Preview and fake transports often dump payloads to stdout to make
manual testing convenient. Email OTPs and confirmation URLs are bearer
credentials, while full recipients and rendered bodies contain personal
data. A non-production label does not make aggregated preview, CI, or
developer logs a safe secret store.

Mitigation: fake transports log only a stable event name, fake message
id, recipient domain, and non-sensitive channel metadata. Their logging
APIs must not accept OTPs, tokens, URLs, bodies, subjects, or full
addresses as log fields; recipient inputs are reduced to a validated
domain before serialization. Console-capture tests use sentinel secrets
and fail if any appear; richer message assertions stay inside the
in-process fake record.

### R12 — Membership is mistaken for write authorization

Project membership answers whether a caller can see a row; it does not answer
whether the caller may mutate it. A policy or route that checks only
`app.is_member(project_id)` silently collapses `owner`, `editor`, and `viewer`
into the same write role. Owner/non-member tests stay green while viewers can
write. Mitigation: keep membership as the row-visibility boundary, apply one
central owner/writer role guard at every project-content mutation route, and
test each operation with owner, editor, and viewer actors.

### R13 — Black-box journey expectations drift after API policy changes

Post-deploy journeys encode observable API status contracts, but shellcheck
only proves that their shell syntax is valid. When an API policy changes
without updating the journey, the first semantic failure occurs after merge.
Mitigation: update black-box assertions and journey docs in the policy PR, then
pin high-risk authorization expectations with a focused PR-gated policy test.

### R14 — PR verification and privileged publication share a trust decision

A pull request can be safe to compile and test without being authorized to
deploy, publish, delete infrastructure, comment, or receive service
credentials. Same-repository branches are not one trust class: Dependabot owns
same-repository branches while GitHub deliberately withholds ordinary Actions
secrets from its runs. A maintainer rerun also changes `github.actor` without
changing who controls the PR branch.

Mitigation: split credential-free verification from privileged jobs. Authorize
the latter with both a same-repository head and the immutable PR author; keep
Dependabot out with
`github.event.pull_request.user.login != 'dependabot[bot]'`. Never recover
credentials by adding Dependabot secrets or changing the trigger to
`pull_request_target`.

### R15 — Persisted client state outlives its authenticated principal

A singleton client-side store can survive sign-out, session expiry, or a direct
account switch even when its server queries are properly authorized. One global
persistence key also lets the next account hydrate the previous account's
last-seen data before a refetch corrects it. Mitigation: wait for a stable user
id before hydration, namespace durable state by that id, withhold descendants
during identity transitions, and clear both active memory and unattributable
legacy state on every unauthenticated boundary.

### R16 — Workspace manifests disagree with the resolved peer graph

A root package-manager override can make a workspace install a different
framework major than its own manifest declares. An undeclared build-tool peer
then lets the package manager choose that peer from whichever dependency update
happens to run first. Each install can be internally valid while Dependabot and
reviewers are reasoning from manifests that describe a different graph.

Mitigation: declare the root-selected React runtime directly in every web
workspace, align its React types, and pin the Astro-compatible Vite major in
both workspaces. Keep `tailwindcss` and `@tailwindcss/vite` on the same patch
line. Workspace smoke tests must parse the manifests and fail when those
compatibility pins drift. If hoisted build code resolves a transitive package
through the workspace root, declare that implementation directly in the
affected workspace rather than relying on the hoister's choice.

### R17 — Fixed timestamps age out of rolling-window tests

An E2E fixture with an absolute timestamp can pass for days or weeks, then fail
without a code change when a filter such as “Past week” computes its boundary
from the real clock. The response is correct, but the test's seed data has aged
out of its own scenario. Seed rolling-window fixtures relative to the database
clock, preserve only the offsets needed for ordering, and keep the browser test
on the real relative filter.

## Bugs

- **2026-06-06** *(R3)* — After [PR #154] unblocked the report-body wire shape, post-merge api-dev still failed at the very last step of all three journeys: `POST /api/auth/sign-out` returned HTTP 500. Root cause: the journey scripts called sign-out with an empty body (`req POST /api/auth/sign-out '' …`) and `req()` strips the `-d` flag entirely when `$3` is empty, so the request went out with no body. better-auth's sign-out handler 500s instead of accepting empty / returning 400. Same script's deliberate `'{}'` test on stress.sh:219 already proved the fix. Filed API followup for the empty-body → 500 layer. Fix: replace `''` with `'{}'` at all six end-of-journey sign-out call sites. [detail](2026-06-06-journey-sign-out-empty-body-500.md)

Most recent first. One line per bug — open the linked file only for the full root-cause / test / commit write-up.

- **2026-08-05** — Native Cloudflare Pages builds queued for up to 47 minutes,
  while exact-SHA verifiers stopped after 15 minutes and reported false red
  checks before successful deployments. Fix: allow a 75-minute marker poll and
  90-minute `dev`/preview jobs, with policy assertions for every affected job.
  [detail](2026-08-05-cloudflare-pages-queue-timeout.md)
- **2026-08-05** *(R5)* — In-process Hono requests represented a zero-byte JSON
  POST with a null body, while `@hono/node-server` exposed an empty stream, so
  deployed finalize/unfinalize returned 400 and hid cross-user 404s. Fix: cache
  exact empty text as `{}` before validation and test through a real listener.
  [detail](2026-08-05-node-http-empty-json-finalize.md)
- **2026-08-05** — The admin Playwright seed used fixed July 29 activity
  timestamps, so its `Past week` filter began returning zero rows on August 5
  and blocked every unrelated API/admin PR. Fix: seed activity relative to the
  database clock while preserving deterministic event order.
  [detail](2026-08-05-admin-e2e-fixed-time-expiry.md)
- **2026-08-05** — Attachment placement and PDF registration used direct
  database timestamps, so `updatedAt` could stay equal at millisecond wire
  precision or move backward under clock skew. Fix: apply the shared monotonic
  report-version rule to both writers and pin them with future-timestamp
  integration tests.
  [detail](2026-08-05-report-version-millisecond-collision.md)
- **2026-08-05** — API integration intermittently failed after all 219
  integration tests passed because two rate-limiter test pools could re-emit
  PostgreSQL shutdown `57P01` while Testcontainers stopped. Fix: observe
  only those pools, tolerate that exact code only during teardown, and fail on
  every other pool error. [detail](2026-08-05-rate-limiter-testcontainers-teardown-57p01.md)
- **2026-08-05** *(R13)* — The post-deploy stress journey still expected a
  server error for empty or malformed sign-in JSON after the API began
  returning the correct 400 `BAD_REQUEST`, so an unrelated dependency merge
  left `dev` red despite every product assertion passing. Fix: accept
  `400|429` for both inputs and enforce the contract in PR-gated CI.
  [detail](2026-08-05-journey-auth-bad-request-drift.md)
- **2026-08-05** — The dormant `harpa-pro-dashboard` Pages project built every
  mirrored `pr-*` ref while `apps/dashboard` existed only in draft PR #211, so
  unrelated pull requests received a failed external dashboard check. Fix:
  disable automatic production and preview builds until a refreshed dashboard
  PR proves its exact head, then broaden previews only after the app lands on
  `dev`. [detail](2026-08-05-dashboard-pages-absent-app-build.md)
- **2026-08-04** — The 256 MB service-less storage worker OOM-restarted on four consecutive daily briefs even with an empty durable queue; its guest had only about 9 MiB available while resident `pnpm`/`tsx` launchers consumed avoidable headroom. Fix: launch through Node's `tsx` loader directly, allocate 512 MB in prod/dev, and emit hourly structured memory samples. [detail](2026-08-04-storage-worker-runtime-overhead-oom.md)
- **2026-08-04** — Production release 31 completed and proved its storage worker, but `flyctl ssh console` stalled after printing only its target address; six hours later the cancelled job still had not run lifecycle arming, readiness, journeys, or OTA. Fix: target the exact worker through bounded Machine exec, retry only after proving the worker id is unchanged, require the database confirmation marker, and cap the outer deploy step. [detail](2026-08-04-fly-ssh-arming-hang.md)
- **2026-08-04** — React Native's `react-devtools-core@6.1.5` allowed
  `shell-quote@^1.6.1`, but the frozen lockfile retained vulnerable `1.8.3`,
  leaving the mobile toolchain exposed to critical command injection and
  high-severity denial-of-service advisories. Fix: narrowly override that edge
  to current `1.10.0` and enforce the resolved version in CI.
  [detail](2026-08-04-react-devtools-shell-quote-security.md)
- **2026-08-04** — API coverage shard failures were opaque because every
  bounded Vitest process used only the blob reporter. Fix: retain blob files for
  the merged threshold while also printing the default failure report to the
  Actions log. [detail](2026-08-04-api-coverage-blob-only-failures.md)
- **2026-08-04** *(R16)* — Astro 7 static builds loaded hoisted CommonJS `cookie@0.7.2` instead of Astro's nested ESM `cookie@2.0.1`, so prerendering failed on a missing named export. Fix: pin `cookie@2.0.1` directly in both web workspaces and assert the build graph. [detail](2026-08-04-astro-cookie-hoist-build.md)
- **2026-08-04** — The PR-time Android smoke first opened its Metro link without a native readiness boundary; the follow-up then exposed `Quickstep isn't responding` intercepting Maestro over a ready Dev Launcher. Fix: recover through the semantic `Wait` action, strictly reassert `Development Build`, and use a bounded post-link wait that can observe a later Quickstep dialog before server/app assertions. [detail](2026-08-04-expo-dev-launcher-readiness-race.md)
- **2026-08-04** *(R14)* — Dependabot PRs entered combined preview/deploy, OTA, and production-journey jobs, so GitHub's withheld secrets made useful verification red while same-repo checks still treated bot-controlled branches as publishable. Fix: split read-only verification, gate every privileged job by immutable PR author, and route direct security updates through human-owned `dev` PRs. [detail](2026-08-04-dependabot-privileged-pr-jobs.md)
- **2026-08-04** *(R16)* — The site and admin manifests declared React 18 while the root override installed React 19.2.0, and both consumed Vite only as an auto-installed peer. Dependency updates could therefore resolve a different peer graph than the manifests described. Fix: align React runtime and types, pin Vite 6.4.3 directly, and keep Tailwind core/plugin patches paired in both workspaces. [detail](2026-08-04-web-peer-graph-drift.md)
- **2026-07-31** *(R5)* — The application PostgreSQL rate limiter implemented
  periodic stale-bucket cleanup, but `server.ts` never started it, so production
  rows could grow indefinitely while middleware tests stayed green. Fix: start
  GC at boot and cover the server entry point plus real-Postgres
  concurrency/cleanup. [detail](2026-07-31-app-rate-limit-gc-not-started.md)
- **2026-07-30** *(R15)* — The persisted React Query cache used one global MMKV key and hydrated before auth resolved, so expired sessions or direct account switches could briefly render the previous account's projects and reports. Fix: authenticate first, namespace snapshots by user id, block descendants while clearing memory on identity changes, and discard the legacy blob. [detail](2026-07-30-query-cache-cross-session.md)
- **2026-07-29** — A manually dispatched API workflow called reusable mobile OTA with inherited `workflow_dispatch` context, so the callee tried blank native registration and could force redundant manual publication. Fix: discriminate successful API calls with their call-only input, skip registration, and evaluate them with effective `workflow_call` policy semantics. [detail](2026-07-29-reusable-ota-dispatch-context.md)
- **2026-07-29** — The first `api-dev` deploy after PR #205 stopped before lifecycle arming when `storage-worker=1` tried to collapse Fly's active/standby pair; later recovery proved Fly can leave an updated Machine stopped and render the clone's same tagged image as `tag@digest`. Fix: remove broad scaling, explicitly start only the exact stopped/no-standby candidate, and compare a narrowly validated canonical tag, at most one explicit digest, and exact release metadata at every fresh proof. [detail](2026-07-29-fly-worker-scale-confirmation.md)
- **2026-07-29** — The first `api-dev` push after PR #202 failed before creating any jobs because its reusable OTA caller was capped at `contents: read` while the nested runtime-registration job requested `contents: write`. Fix: grant write only on the reusable-call jobs, preserve the called workflows' read-only default, and add a scoped policy regression. [detail](2026-07-29-reusable-workflow-permission-ceiling.md)
- **2026-07-29** — PR-time Android smoke first stayed on Expo Dev Launcher's Home screen, then a later run exhausted its 60-second readiness wait with the cold bundle still at 90 percent. Fix: select the green `http://10.0.2.2:8081` row, wait fail-closed for `Continue|Email` for 90 seconds, and retain hidden Maestro UI diagnostics. [detail](2026-07-29-expo-dev-launcher-server-not-selected.md)
- **2026-07-29** *(R13)* — The stress journey still expected a viewer project rename to return 200 after the API made viewers read-only, so a correct post-deploy 404 would fail the journey. Fix: align the assertion and README with the reviewed contract and add a PR-gated shell policy check. [detail](2026-07-29-stress-viewer-policy-drift.md)
- **2026-07-28** — API idempotency was a process-local check-then-act
  cache: concurrent requests and retries routed to another Fly machine
  could duplicate AI calls, report mutations sent no stable key, and
  one key could collide across method/path/body. Fix: scoped request
  hashes, in-flight memory coalescing, durable Postgres leases/responses,
  and stable mobile retry keys. [detail](2026-07-28-idempotency-process-local-race.md)
- **2026-07-28** *(R5)* — `DELETE /me` removed account/file rows but could leave registered, orphaned, or late-presigned R2 objects because cleanup was neither default-wired nor durable. Fix: upload leases, atomic delete jobs, a scheduled retry worker, safe-prefix reconciliation, and a real late-PUT MinIO proof. [detail](2026-07-28-account-delete-left-r2-objects.md)
- **2026-07-28** *(R5)* — An authenticated `fixtureName` could downgrade `AI_LIVE=1` requests to checked-in replay, while recorder paths could persist customer/site identifiers because redaction was isolated or bypassed. Fix: make mode server-owned, share a cross-context redaction boundary, sanitize fixtures, and add live route plus privacy guards. [detail](2026-07-28-ai-fixture-trust-boundary.md)
- **2026-07-28** *(R12)* — Project-content routes relied on membership-scoped RLS alone, so viewers could update projects, reports, notes, files, invoke generation, and finalize. Fix: central owner/writer route guards plus a real owner/editor/viewer Testcontainers matrix. [detail](2026-07-28-membership-collapsed-project-roles.md)
- **2026-07-28** *(R11)* — Fake OTP and fake Resend paths printed full recipients plus OTPs or rendered confirmation messages, putting bearer credentials and personal data into preview/developer logs. Fix: centralize metadata-only email diagnostics and pin both paths with console-capture regressions. [detail](2026-07-28-preview-email-secret-logs.md)
- **2026-07-28** *(R15)* — The root mobile upload queue persisted every account's jobs under one MMKV key and survived auth teardown, so a queued upload could resume under the next signed-in account. Fix: user-scope persistence, defer hydration until auth resolves, and abort/clear on sign-out, 401, or user-id change. [detail](2026-07-28-upload-queue-cross-session.md)
- **2026-06-26** — Qualitative worker counts such as `"a few"` survived the API wire shape but disappeared in the rendered report because `report-core` / mobile adapters coerced role counts back to numbers and displayed `0`. Fix: keep role counts as `string | null`, parse only for math, and add report-card/stat/PDF regressions. [detail](2026-06-26-qualitative-worker-count-hidden.md)
- **2026-06-26** — Local iOS release-stress failed in `modules/17-heavy-usage-stress.yaml` after adding 20 notes; the screenshot showed `Notes (20)` but the viewport was sitting around notes 7-12, so `note-row-19` was offscreen. Fix: scroll to `note-row-19` before asserting it, then continue the oldest/newest scroll coverage. [detail](2026-06-26-maestro-stress-note-row-offscreen.md)
- **2026-06-26** — Local iOS release-stress failed in `helpers/sign-out.yaml` after `tapOn id: btn-open-profile`; the screenshot stayed on Projects and `btn-sign-out` never appeared. Root cause: XCTest reported the header icon tap complete without navigating. Fix: retry the profile tap once if the Projects header icon is still visible, then assert `screen-profile` before sign-out. [detail](2026-06-26-maestro-profile-tap-no-navigation.md)
- **2026-06-26** — Local iOS regression failed in `helpers/edit-report-cards.yaml` after `tapOn id: btn-edit-section-.*`; the screenshot stayed on the report screen with the first section action clipped under the sticky report tabs. Root cause: the broad regex matched a clipped first section edit button. Fix: target stable `btn-edit-section-1` for section edit/delete coverage. [detail](2026-06-26-maestro-section-edit-regex-clipped-tab.md)
- **2026-06-26** — Local iOS regression failed in `modules/14-account.yaml` after opening the delete-account sheet; the screenshot showed the row rendered as `Projects deleted: Wiring Smoke Project`, but Maestro exposes that mixed text as one combined accessibility string. Fix: assert `.*Projects deleted.*` in both account delete Maestro flows. [detail](2026-06-26-maestro-account-delete-label-drift.md)
- **2026-06-26** — Local iOS regression failed in `modules/12-report-debug.yaml` while scrolling to `debug-prompt`; the screenshot showed the prompt card was already visible but taller than the viewport. Root cause: `scrollUntilVisible` required 100% visibility for a tall section. Fix: use a low visibility threshold for positioning and assert the prompt section/text separately. [detail](2026-06-26-maestro-debug-prompt-tall-section.md)
- **2026-06-26** — Local iOS regression failed in `modules/11-generate-finalize.yaml` after tapping `btn-edit-issue-.*`; the screenshot showed the issue card clipped at the bottom and the sticky recorder strip active instead of the edit modal. Root cause: Maestro considered the edit button visible inside the bottom sticky input/recorder region. Fix: center per-item report edit controls before tapping and wait for the edit sheet's first body input. [detail](2026-06-26-maestro-bottom-recorder-overlays-report-edit.md)
- **2026-06-26** — Local iOS regression failed in `modules/10b-photo-notes-finalized.yaml` after tapping `btn-report-actions`; the screenshot showed the button clipped at the top and no actions menu open. Root cause: scroll stopped at partial visibility. Fix: require full visibility, center the header action, and wait for `report-actions-menu` before asserting `btn-report-delete`. [detail](2026-06-26-maestro-clipped-report-actions-button.md)
- **2026-06-26** — Local iOS regression failed at `btn-onboarding-submit`, then at `btn-save-project`, while screenshots showed navigation had already succeeded; later runs failed because `hideKeyboard` could not dismiss multiline `input-note`/report edit fields and could submit delete-account after exact email confirmation. Root cause: `hideKeyboard` can submit iOS forms before the next explicit tap, and can fail on RN multiline/modal inputs. Fix: conditionally tap form submit/save after `hideKeyboard`; for note input, tap Add while visible and swipe down; for edit/cancel paths, avoid `hideKeyboard` or avoid exact destructive confirmation values. [detail](2026-06-26-ios-maestro-hidekeyboard-submits-form.md)
- **2026-06-16** *(R10)* — TestFlight iPhone voice recording failed at start with `prepareToRecordAsync` / `Failed to prepare recorder`, then showed the raw native exception in the app sheet. Root cause: the iOS recorder options used handwritten `outputFormat: 'mpeg4aac'`; Expo SDK 55 expects `IOSOutputFormat.MPEG4AAC` (`'aac '`), and iOS converted the bad string into an invalid `AVFormatIDKey`. Fix: derive the options from the Expo preset/constants, keep raw diagnostics for Sentry, and show friendly user copy. [detail](2026-06-16-ios-voice-recorder-invalid-aac-format.md)
- **2026-06-14** — Local Android regression failed at `input-email` with the auth screen loaded behind Expo's dev-menu onboarding sheet. Root cause: after a cold Metro bundle, the sheet can appear after the single post-`openLink` dismissal pass. Fix: add Expo's `disableOnboarding=1` dev-client URL param and keep label-based fallback dismissals only. [detail](2026-06-14-android-dev-menu-cold-bundle-late.md)
- **2026-06-14** — Local Android regression failed in 10c at `btn-tab-report` with the Finalize Report sheet open. Root cause: the flow matched a disabled `Generating...` action row, then Maestro tapped the same coordinates after the row had changed to `Finalize report`. Fix: make manual generate/update conditional on visible text, cap regenerate tap settle waits, and leave scrolled disabled-state checks to unit coverage. [detail](2026-06-14-maestro-generate-stale-tap-finalize.md)
- **2026-06-14** — Local Android regression failed in module 11 after saving `E2E sealant` because `scrollUntilVisible(centerElement: true)` first saw the text, then scrolled it away while trying to center it. Fix: assert already-visible edited text directly and avoid centering on follow-up text assertions. [detail](2026-06-14-maestro-scroll-centers-visible-text-away.md)
- **2026-06-11** — Local Android auth reached `input-otp` but `last-otp.js` returned 404 even though the API had issued Alice's OTP. Root cause: `mo run` passed only `MAESTRO_APP_ID` through Maestro `--env`; `${DEV_OTP_TOKEN}` in `sign-in.yaml` resolved to the wrong value because Maestro does not read arbitrary child process env vars for YAML/script globals. Fix: pass through `DEV_OTP_TOKEN` and optional `API_BASE_URL` via `--env`, with a spawn-argv regression test. [detail](2026-06-11-maestro-dev-otp-token-not-forwarded.md)
- **2026-06-11** — Android local regression still failed at `input-email` after the device wake fix because the `exp+harpa-pro-v4://...` openLink surfaced Samsung's resolver sheet when both `Harpa Pro` and `Harpa Pro Dev` were installed. Fix: extend the shared post-openLink helper to select `Harpa Pro Dev` + `Always` when `Open with` is visible, while preserving the iOS `Open` dialog path. [detail](2026-06-11-android-resolver-intercepts-dev-client-link.md)
- **2026-06-10** — Local Android Maestro failed before auth because the physical device entered DreamActivity/keyguard during the reset + dev-client open sequence. `KEYCODE_WAKEUP` alone only woke the panel; Samsung immediately returned to dreams or the secure bouncer, so `input-email` assertions ran against the screensaver. Fix: `mo run` now keeps Android awake, disables dream settings, presses wake/menu, and fail-fast checks `dumpsys window` for DreamActivity/Bouncer before spawning Maestro. [detail](2026-06-10-android-dream-keyguard-blocks-maestro.md)
- **2026-06-06** *(R9)* — Placing a photo group into an issue/section card "worked" for a split second then reverted to the bottom Unplaced grid. `updateNotePlacement` was calling `bumpNotesChangedAt`, which caused `useAutoRegenerate` to fire a fresh LLM regen on every placement edit; the regen reshaped `issues[]`/`sections[]`, `splitPlacements` dropped the just-placed group into `orphans`, and `ReportTabPane`'s orphan-healer fire-and-forgot a `placement=null` PATCH. First fix: carve placement out of `notes_changed_at` and report invalidation. Structural fix: v2 stores placement in `report.body.*.attachments.images[]`, updates it via `PATCH /projects/{project}/reports/{number}/attachments`, and sanitizes invalid attachment ids server-side so the client no longer self-heals user placement away. [detail](2026-06-06-photo-placement-reverts-after-bump-regen-loop.md)
- **2026-06-06** *(R3)* — After PRs #151–#153 unblocked auth/seed, journeys finally got past sign-in and immediately surfaced two pre-existing bugs that had been hidden for weeks. (1) `core.sh` / `extended.sh` / `stress.sh` PATCHed `reportBody` with the legacy v3 shape (`weather.temperatureC`, `windKph`, numeric `count`/`hours`/`quantity`, `meta.tags[]`) but the schema migrated to string-everywhere ~2 weeks ago (`weather.temperature` + `wind` strings, all counts as strings, no `tags` field). Every journey-core PATCH 400'd. (2) When `EMAIL2 == EMAIL` (single-account dev — the current state), `extended.sh`'s `POST /projects/:id/members` invites the project owner as a member and 409's; `stress.sh`'s cross-user assertions were equally bogus. Fix: align all three scripts to the current wire shape; gate the user-2 / cross-user branches on `EMAIL2 != EMAIL`. [detail](2026-06-06-journeys-report-body-wire-drift.md)
- **2026-06-06** *(R1 × R3)* — Three consecutive `api-dev` post-deploy runs failed with `✗ no set-auth-token header on sign-in (rc=1)` even after PRs #148–#150 had aligned the journey scripts to better-auth's response shapes. Root cause was much simpler than the rate-limit / lockout symptoms suggested: `packages/api/scripts/seed-test-account.ts` exists to materialise `TEST_ACCOUNT_EMAILS` as better-auth users, but it had no `db:seed-test-account` npm script, no Dockerfile step, no CI step, and was missing from `fly.dev.toml`'s `release_command`. The 2026-06-02 better-auth migration switched journeys from the legacy `/auth/password/verify` (phone) to `/api/auth/sign-in/email` — so every post-migration journey sign-in 401'd because `alice@e2e.harpapro.com` simply didn't exist in dev's DB. The drift hid because api-dev only runs post-merge AND yesterday's last-green api-dev was still on the pre-better-auth journey scripts. Fix: add `db:seed-test-account` to `packages/api/package.json` and chain it into `fly.dev.toml`'s `release_command` after `db:migrate`; the seed script is already idempotent and no-ops when the env vars are unset (so prod is unaffected). Also harden stress.sh section A to use a stable bait email outside `TEST_ACCOUNT_EMAILS` for "wrong password" / "missing password field" checks so we never touch real accounts' (future) attempt budgets. Followups (filed): PR-gated `auth.error-shapes.test.ts` and PR-gated journey-smoke against Testcontainers — both would have caught the seed gap *and* the response-shape drift the day they landed. **Followup #1**: the seed script itself had been crashing because it called `auth.api.signUpEmail()`, which is unconditionally rejected when `disableSignUp: true` — fixed via `auth.$context.internalAdapter` in PR #152. **Followup #2**: even with seeding working, the journeys defaulted to alice/bob while Fly held a different test address; PR #153 wires `EMAIL`/`EMAIL2` to GitHub repo variables that mirror Fly's `TEST_ACCOUNT_EMAILS_DEV`. [detail](2026-06-06-test-accounts-never-seeded-on-dev.md)
- **2026-06-06** — Post-deploy `scripts/journeys/*.sh` failed on dev after the boot crash (above) was fixed. The stress journey still asserted the pre-better-auth contract: 400 for empty/invalid sign-in fields, 401 for sign-out with a fake bearer. better-auth normalises every credential-shape failure to `401 Invalid email or password` and treats sign-out as idempotent (always 200 even with a fake token); the scripts had not been updated since the 2026-06-02 better-auth migration. A third path — empty body / malformed JSON on `/api/auth/sign-in/email` — currently 500s because there's no error-mapper in front of `auth.handler`; the journey now asserts the current 500 with a comment to flip when the mapper lands. The drift hid because journey scripts only run post-deploy from `api-dev.yml` / `api-prod.yml` and the dev boot crash had been masking every post-deploy run for days. Fix: align stress.sh expectations (401 for invalid creds, 500 for unparseable bodies, 200 for fake-token sign-out), add `sleep 1` between sign-in attempts so GHA runners don't burn through the 120/min per-IP unauthed rate limit. [detail](2026-06-06-journey-scripts-better-auth-drift.md)
- **2026-06-06** — `harpa-pro-api-dev` crashed at boot with `Error: routes/dev.ts must not be loaded in real production`, masking itself for days behind cold-start `/readyz` timeouts (the runner gave up before the crash log surfaced). `app.ts` does a top-level static `import { devRoutes } from './routes/dev.js'`, but `dev.ts` had a top-level `throw` guarded on `NODE_ENV === 'production' && HARPAPRO_PR_BUILD !== '1'` — exactly the dev-Fly env shape (`fly.dev.toml` sets `NODE_ENV = "production"` and never sets `HARPAPRO_PR_BUILD`). ESM evaluates the imported module body unconditionally, so the throw fired before the conditional mount in `app.ts` could skip the route. The "layered control 1" docstring was wrong by construction. Fix: drop the module-level throw; the mount gate in `app.ts` plus the env.ts refines (`DEV_OTP_TOKEN` must be unset on real prod, must be set in dev/PR) already enforce the same invariant at boot via Zod. Add `app.boot.test.ts` that imports `app.ts` and `routes/dev.ts` under the dev-Fly env shape to prevent any future top-level side-effect from re-introducing the crash. [detail](2026-06-06-routes-dev-boot-crash.md)
- **2026-06-06** *(R5)* — API process crashed sporadically with a fatal `Error: read ETIMEDOUT` (HARPA-PRO-A in Sentry; tagged `auto.node.onuncaughtexception`, transaction `/readyz` was misleading — that was just the next request after replay). Root cause: `getPool()` never registered a `pool.on('error', …)` listener, so when Neon culled an idle TLS client the underlying socket error bubbled to the pool with nobody listening, Node treated it as `uncaughtException`, and Fly rolled the machine. Testcontainers doesn't cull idle clients so CI was always green. Fix: attach a single error listener at pool construction that forwards the error to Sentry with a synthetic `route: 'pg.pool.idle-client'` tag, plus a default-wiring test that asserts the listener exists and absorbs a synthetic ETIMEDOUT. [detail](2026-06-06-pg-pool-idle-error-uncaught.md)
- **2026-06-06** — `api-dev` workflow went red on three consecutive `dev` pushes at the "Verify /readyz (dev)" step. Dev Fly app runs `auto_stop_machines = "suspend"` + `min_machines_running = 0`, so machines are stopped right after a deploy and the first request must wake them; the inline verify loop used `curl --max-time 5` × 5×5s, well below the cold-boot time (Linux + Node + DB pool + schema-head probe). Prod was masked by `min_machines_running = 2`. Worse: the verify step only ran on push to `dev` (post-merge), so PR CI never exercised the deploy path and the regression couldn't be caught pre-merge. Fix: extract the loop into `scripts/ci/verify-readyz.sh` with `--max-time 30` × 6 + 10s sleep (≈4 min budget); wire `api-dev.yml`, `api-prod.yml`, and `pr-preview.yml` to share it; add `scripts/ci/__tests__/verify-readyz.test.sh` (fakes a 6-second cold-start HTTP server) running in `lint-typecheck` so a future regression to a 5s timeout fails PR CI before it lands; add a `flyctl status` + `flyctl logs` diagnose-on-failure step so the next investigation doesn't start from zero. [detail](2026-06-06-api-dev-readyz-cold-start.md)
- **2026-06-06** — Voice-recorder waveform was visually flat on **both** iOS and Android after the HARPA-PRO-D fix (#134). That fix moved every option out of the `new AudioModule.AudioRecorder(...)` constructor into `prepareToRecordAsync(...)` because the JS shim's `createRecordingOptions()` only flattens the nested `{ android: { audioEncoder: 'aac' } }` block in the prepare path. But `isMeteringEnabled` is captured at **constructor time** on both platforms — iOS via `AVAudioRecorder.meteringEnabled = YES` at init, Android via `AudioRecorder.kt:41 private var meteringEnabled = options.isMeteringEnabled` (and `prepareRecording()` builds a new `MediaRecorder` but never re-reads `isMeteringEnabled` again). With an empty constructor, metering was off on both platforms, so `recorder.getStatus().metering` came back `undefined`, our `amplitude` defaulted to 0, and all 30 waveform bars rendered at min height (audio file itself was unaffected — still AAC m4a, audible on playback). Fix: pass the *same* options object to **both** the constructor (so metering takes effect on both platforms) and `prepareToRecordAsync()` (so the shim still flattens the platform blocks for the AAC encoder). Companion to the AMR-NB fix below.
- **2026-06-06** *(R5)* — Follow-up to the same-day string-y wire change: renamed `weather.temperatureC` → `weather.temperature` and `weather.windKph` → `weather.wind`, and updated both prompts to instruct the LLM to include the unit in the value (`"20°C"`, `"5 mph"`). The old names locked the contract into UK units and made the model silently convert whatever the field crew said; the new shape lets the unit ride with the phrase. Existing rows backfilled by a one-off psql script (`scripts/oneoff/2026-06-06-rename-weather-keys.sql`) that renames the JSONB keys in place and suffixes `°C` / ` km/h` onto legacy values; no tracked migration, no JS-side back-compat shim. [detail](2026-06-06-report-body-weather-units-in-value.md)
- **2026-06-06** *(R5)* — Structural follow-up to the four R5 incidents on the report path in two weeks: widened every numeric / enum-ish leaf in `reportBody` to `string | null` (`weather.temperatureC`, `weather.windKph`, `workers[].count`, `workers[].hours`, `materials[].quantity`, `issues[].severity`). Data is fundamentally text extracted from a voice transcript; the schema now accepts whatever the LLM emits (`"4"`, `"a few"`, `"around 20"`, `"12 m³"`, `"Critical"`) and the 1–2 consumers that need a number parse on read (`toNum()`, `Number.parseFloat`) with explicit 0-fallback. The PR #133 drift guard auto-adapts (now generates `str|null` assertions); the live lane stays as a value-shape safety net. [detail](2026-06-06-report-body-string-wire.md)
- **2026-06-05** *(R5)* — Android voice-note recordings produced 8 kHz AMR-NB inside an `.m4a` extension instead of the AAC-LC m4a the `arch-voice-pipeline.md` §D5 contract promises (HARPA-PRO-D in Sentry: Groq Whisper rejected a 2:27 clip with HTTP 500; shorter Android clips happened to "work" by accident on an unsupported codec). `expo-audio`'s nested `{ android: { audioEncoder: 'aac' } }` is only flattened by the JS shim on `prepareToRecordAsync()`; we were passing it to the `AudioRecorder` constructor instead, where the bridge dropped the nested keys and the native side fell through to `MediaRecorder.AudioEncoder.DEFAULT` = AMR-NB. Fixture recorder + iOS-sim coverage masked it — the bug only existed on real Android. Fix: move the platform-options object from the constructor call to `prepareToRecordAsync()` in `expoAudioRecorder.ts`.
- **2026-06-05** *(R5)* — `workers[].count` was strict `z.number().int().nonnegative()`, so /reports/:n/regenerate 502'd whenever notes mentioned a role without a specific headcount and the LLM emitted `count: null` (HARPA-PRO-6, dev + 1 prod hit on `0.1.5+6dc0bd5`). Replay fixtures all carried integer counts so unit tests stayed green. Fix: widen the contract field to `.nullable()` (mirrors `hours`); update both prompts to advertise `"count": int>=0|null` with an explicit "use null when unknown" rule; extend the offline drift guard to assert the prompt's nullability hint (not just the field name); harden the adapter `totalWorkers` reduction with `?? 0`; rehash report fixtures. **Superseded structurally by the 2026-06-06 entry above.** [detail](2026-06-05-workers-count-non-nullable.md)
- **2026-06-04** *(R8)* — `POST /api/dev/last-otp` and its in-process CLI/journey twins looked up the latest OTP with `WHERE identifier LIKE '%email%'`. A request with `{"email":"%"}` returned the most recent OTP issued to any registered user — full session takeover for anyone who could reach the route, with `NODE_ENV !== 'production'` as the only gate. Substring oracle on top: `alice@…` matches `bob+alice@….evil`. Fix: rewrite the route with shared-secret header (`x-dev-otp-token`, constant-time compare), `@e2e.harpapro.com` allowlist regex, exact identifier match (`= 'sign-in-otp-' || $1`), audit log, uniform 404; gate mount on `env.DEV_OTP_TOKEN`; env-Zod refines reject the token on prod. Same exact-match fix in `_helpers.ts` + `_login.ts`. New integration test exercises every reject path. [detail](2026-06-04-dev-otp-like-wildcard-oracle.md)
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
- **2026-05-15** *(R5)* — `/api/auth/sign-out` deletes the session row but the JWT keeps authenticating: `withAuth()` only checks signature/expiry, not `auth.sessions`. Test asserted DB deletion, not the contract. **Resolved by the better-auth migration** — sessions are now validated against `public.session` on every request, so deleting the session row revokes the bearer immediately. [detail](2026-05-15-logout-jwt-not-revoked.md)
- **2026-05-15** *(R6)* — `auth.test.ts > rejects a tampered token` flaked ~6%: flipping the final base64url char of an HS256 signature is a no-op when chars share top-4 bits (A↔B↔C↔D). Fix: tamper the payload segment instead — every bit is significant. [detail](2026-05-15-auth-tampered-token-base64-flake.md)
- **2026-05-14** *(R5)* — Waitlist returned 202 with empty DB: `fakeTurnstile()` only accepted `tt-…` tokens while the real widget emits Cloudflare-format tokens; every test stubbed Turnstile so the default factory was untested. Fix: accept any non-empty token + default-wiring integration test. [detail](2026-05-14-fake-turnstile-magic-token.md)
- **2026-05-13** *(R4)* — Colocating `_layout.test.tsx` inside `app/` pulled `vitest` → `@vitest/runner/utils` → `chai` into the Metro bundle and crashed every screen at runtime. Fix: move tests under `apps/mobile/__tests__/...`; prefix non-route helpers with `_`. [detail](2026-05-13-vitest-leak-via-colocated-tests.md)
- **2026-05-13** *(R2)* — `.js` extensions in mobile relative TS imports re-broke Metro bundling; reintroduced by hand-written modules mirroring the API style and by the `gen-hooks.ts` template. Fix: strip `.js` everywhere under `apps/mobile/**` + fix the generator. [detail](2026-05-13-mobile-js-extension-relative-imports.md)
- **2026-05-13** *(R3)* — `AppLayout` crashed with "Rendered fewer hooks than expected" when the auth gate flipped: `useEffect` lived below an early `<Redirect />`. Fix: hoist all hooks above any conditional return + re-render test across auth transitions. [detail](2026-05-13-app-layout-hook-order-auth-gate.md)
- **2026-05-12** *(R1)* — Hono v4 `onError` only runs for `Error` instances; non-Error throws (`throw 'oops'`, `throw 42`, …) bypass `errorMapper` entirely. Fix: no code change; property test narrows to Error subclasses and pins the limitation. [detail](2026-05-12-hono-onerror-non-error-throws.md)
[PR #154]: https://github.com/patrickchin/harpa-pro/pull/154
