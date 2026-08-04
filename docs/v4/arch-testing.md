# Testing strategy

> Resolves [Pitfall 1](pitfalls.md#pitfall-1--p1-done-without-real-api-tests),
> [Pitfall 2](pitfalls.md#pitfall-2--llm-fixtures-retrofitted-not-designed-in),
> [Pitfall 3](pitfalls.md#pitfall-3--mobile-shell-drifted-from-the-visual-design),
> [Pitfall 10](pitfalls.md#pitfall-10--coverage--docs--tests-in-p5p6p7-instead-of-inline).

## Test pyramid

```
                    ▲
                    │
            Maestro (≈ 60 flows)
                    │
         API integration (Testcontainers)
                    │
   Vitest unit + behaviour (the bulk)
                    │
                    ▼
```

> **No automated screenshot diffs.** Visual review uses the relevant
> `design-*.md` or `plan-*.md` spec. If neither exists, it uses the
> current implementation and tests as the baseline.

## Per-layer rules

### Vitest unit / behaviour

- Run on every commit locally; required for merge in CI.
- Mobile: MSW intercepts HTTP. AI fixture replay via the fake
  client.
- API: in-process Hono `app.fetch()` calls; DB stubbed for pure
  unit tests, real DB for integration.

### API integration (Testcontainers)

- Spins up a real Postgres in Docker per worker.
- Runs migrations, seeds via factories in
  `packages/api/src/__tests__/factories/`.
- Two test actors per test (`alice`, `bob`) so per-request scope
  tests are always paired.
- `test:coverage` collects unit coverage plus two sequential,
  serial Testcontainers shards, then merges the Vitest blobs so the
  report includes both pure helpers and database-backed route
  handlers without retaining every container's coverage map in one
  process.
- CI rejects less than 90% line coverage on `packages/api/src/`.

### Per-request scope tests

Lives in `packages/api/src/__tests__/scope/`. For every authed
table, three tests:

1. own-row read/write succeeds.
2. cross-actor read returns empty / 404.
3. cross-actor write returns 403/404.

A grep-gate (`scripts/check-scope-tests.sh`) fails CI if a new
authed route lacks the trio.

### Contract tests

- `packages/api/src/__tests__/contract/openapi.test.ts` runs every
  route, captures real responses, validates them against the
  generated Zod schemas. Drift fails the test.

### Fixture-replay tests for AI routes

Each AI-touching route has a test that:

1. Sends a request with `X-Fixture-Name: <name>`.
2. The route picks up the fixture name (test mode only).
3. Asserts response matches the recorded fixture.

### Live AI regression lane

- `ai-live.yml` runs the live provider tests when prompts, provider
  wiring, report schemas, or the live-test harness changes.
- Each real provider call has a 120-second test budget inside the
  workflow's 10-minute job budget. Provider timeouts still fail the
  lane; schema and model-routing assertions are never retried.
- Run it manually with
  `AI_LIVE=1 OPENAI_API_KEY=… pnpm --filter @harpa/api test:live`.

### Mobile visual review

- Manual, in the iOS simulator, against the relevant `design-*.md`
  or `plan-*.md` spec. If neither exists, compare the current
  implementation and tests.
- There is no automated diff and no `pnpm visual:diff` script.
  Cosmetic drift is caught by reviewer eye; it is still a P0 bug.
- Add a task-specific design doc before making a design change.

### Metro bundle smoke

- `pnpm --filter @harpa/mobile bundle:smoke` exports a real iOS
  bundle and checks both Metro's resolver output and exported module
  metadata for test/Vitest leakage.
- `e2e-maestro-testid-gate.yml` runs it on every mobile-relevant PR
  and push. Unit tests alone do not exercise Expo Router's Metro
  context or native-module resolution.

### Maestro E2E

- `.maestro/` contains the flows.
- `appId` is read from `MAESTRO_APP_ID` (Pitfall 9).
- Mobile-relevant PRs build and install the Android dev client on a
  real emulator, then run the bounded
  `.maestro/ci-launch-smoke.yaml` flow. The job has a 30-minute
  ceiling, emulator boot has a 300-second ceiling, and the Maestro
  command has a 420-second ceiling.
- After clearing app state, the flow waits up to 30 seconds for either
  the Expo Dev Launcher home screen or Android's known Quickstep ANR
  dialog. It chooses the dialog's semantic `Wait` action conditionally,
  then requires the `Development Build` heading within 30 seconds before
  opening the Metro deep link. It performs the same conditional recovery
  once after `openLink`: a 90-second union wait observes Quickstep,
  the Metro server row, or app UI before conditional recovery, server
  selection, and app assertions.
- The PR APK targets only the emulator's `x86_64` ABI instead of
  compiling the three unused Android ABIs. Gradle dependencies are
  restored from a cache keyed by the lockfile and mobile prebuild
  inputs.
- Before the emulator starts, CI applies the runner action's
  documented world-readable/writable `/dev/kvm` udev rule so hosted
  Ubuntu uses hardware acceleration instead of falling back to
  `-accel off`.
- AI calls go through replay mode automatically — `:mock` build
  ships fixtures.
- Full regression and native-input flows remain explicit local /
  release checks; the PR smoke proves native build, Metro startup,
  installation, launch, and a rendered sign-in control.

### Docs site (Playwright)

- `apps/site/tests/docs.spec.ts` covers local search, empty results, guide
  traversal, responsive navigation, internal links, assets, duplicate ids,
  and the branded 404 against the production static build.
- `apps/site/tests/header.spec.ts` checks the desktop and mobile dashboard
  actions against the same `PUBLIC_DASHBOARD_URL` embedded in that build.
- `site-preview.yml` also waits for the native Cloudflare Git deployment's
  exact-SHA marker and verifies one checked-in legacy redirect.

### Dashboard (Playwright)

- `test:e2e` keeps broad mock-backed browser coverage.
- `test:e2e:live` runs one serial Chromium journey against the stable
  `pr-<n>.harpa-pro-dashboard.pages.dev` alias and its isolated API.
- The workflow first verifies the Fly API at GitHub's synthetic merge SHA.
- It then verifies the Pages marker at the pull request head SHA and checks SPA
  routing before the live journey starts.
- The live lane uses public password-account email identities from the Pages
  build. It loads the password from Doppler only after deployment.

## Test the default wiring

> Resolves [Pitfall 13](pitfalls.md#pitfall-13--di-stubs-become-the-spec-default-wiring-silently-broken)
> and [Pattern R5](../bugs/README.md#r5--di-stubs-become-the-spec-default-wiring-silently-broken).

DI helpers like `setWaitlistClients({ turnstile, resend })` make it
trivial to swap collaborators for fakes. They also make it trivial
to never actually run the route through its **default** wiring —
the wiring that `docker compose up`, `:mock` builds, and PR
previews depend on. When 100% of a route's tests inject a stub,
the stub _is_ the spec; the factory is untested.

The rule, applied to every route that constructs a collaborator
via a `createXClient()` factory:

1. **One default-wiring integration test per factory.** Call the
   route through `app.fetch()` without overriding the collaborator
   in question. Assert the real side-effect (DB row, queued email,
   recorded fixture call). Example: [`waitlist.integration.test.ts → "default fakeTurnstile (compose / :mock builds) accepts any non-empty token end-to-end"`](../../packages/api/src/__tests__/waitlist.integration.test.ts).
2. **Negative-path stubs stay narrow.** Use `alwaysFailX()` only in
   the test that asserts the failure branch. Do not encode the
   "fail" signal into a magic input shape (`tt-…`, `fake-…`) the
   real dev surface cannot generate — the dev path will trip over
   it silently.
3. **Fake-mode behaviour matches the real dev surface.** Whatever
   token / payload the local widget or fixture-mode client emits
   must be the happy path of the corresponding fake. Document the
   accepted shape next to the fake's definition.
4. **One browser/device E2E per critical user flow.** This is the
   only test type that proves env wiring, CORS, real widget output,
   and the default factory hang together. Playwright for
   `apps/site`, Maestro for `apps/mobile`. The waitlist E2E hits the
   live compose stack and asserts the persisted side-effect.

Reviewer heuristic: if a PR adds a `setXClients(...)` call without
adding a default-wiring test for the same surface, that's the
review note.

## CI workflows

Active today:

| Workflow                      | Trigger                   | Gate                                                                                                   |
| ----------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `lint-typecheck.yml`          | every push                | ESLint + tsc clean across the workspace                                                                |
| `unit.yml`                    | every push                | `pnpm test` green                                                                                      |
| `api-integration.yml`         | every push                | Combined API unit + Testcontainers suite green at ≥ 90% line coverage                                  |
| `e2e-maestro-testid-gate.yml` | mobile-relevant PR / push | testID policy, Metro bundle leakage, and bounded Android Maestro launch smoke with failure diagnostics |
| `dependency-review.yml`       | every PR                  | Reject newly introduced high or critical dependency vulnerabilities                                    |
| `pr-preview.yml`              | PR open / push            | Credential-free path/migration guards; human-owned PR preview lifecycle                                |
| `pages-preview-ref.yml`       | human-owned same-repo PR  | Mirror/delete the exact `pr-N` Git ref without checking out PR code                                    |
| `mobile-ota-pr.yml`           | mobile-relevant PR        | Human-owned same-repo PR OTA publication                                                               |
| `admin-preview.yml`           | admin-relevant PR         | Credential-free checks plus exact-SHA native Pages preview verification                                |
| `admin-dev.yml`               | push to `dev`             | Verify the exact SHA and routes on the native admin `dev` deployment                                   |
| `admin-prod.yml`              | push to `main`            | Verify the exact SHA and routes on both native admin production hostnames                              |
| `site-preview.yml`            | PR to `dev` or `main`     | Credential-free checks plus exact-SHA native Pages preview verification                                |
| `site-dev.yml`                | push to `dev`             | Verify the exact SHA on the native public-site `dev` deployment                                        |
| `site-prod.yml`               | push to `main`            | Verify the exact SHA on every native public-site production hostname                                   |
| `dashboard-preview.yml`       | PR to `dev` or `main`     | Verify exact head-SHA Git preview, SPA routing, and live browser checks on the stable alias            |
| `dashboard-dev.yml`           | push to `dev`             | Verify the exact SHA and SPA routes on the native dashboard `dev` deployment                           |
| `dashboard-prod.yml`          | push to `main`            | Verify the exact SHA and SPA routes on approved dashboard production hostnames                         |

### Dependency security automation

GitHub reads [`.github/dependabot.yml`](../../.github/dependabot.yml) from
the repository's default branch, `main`. It checks the root pnpm workspace
and GitHub Actions weekly. Routine version-update pull requests target
`dev`. Compatibility-coupled Better Auth, React, Astro/Vite, Drizzle, AWS SDK,
and TypeScript-ESLint packages update as coordinated stacks. The broad
production/development groups accept patches only, so unrelated minor updates
remain focused. Expo and React Native packages are ignored here: Expo Doctor
and `expo install` own that native compatibility graph as a staged SDK
migration.

Dependabot security updates are enabled separately under **Settings → Code
security and analysis**. They are advisory-driven rather than scheduled and
always target the default branch, `main`; the `target-branch: dev`
customizations apply only to routine version updates. The configuration does
not become active until it reaches `main`.

Dependabot pull requests run with reduced credentials. Credential-free tests,
lint, typechecking, browser checks, builds, path detection, and migration-name
guards must keep running. Jobs that deploy Cloudflare/Fly/Neon previews,
publish EAS updates, delete preview infrastructure, or comment on a pull
request require both a same-repository head and a non-Dependabot PR author:
`github.event.pull_request.user.login != 'dependabot[bot]'`. Use the PR author,
not `github.actor`, because a maintainer rerun changes the actor without
changing who controls the branch. Never expose these credentials as
Dependabot secrets and never switch to `pull_request_target` to recover them.

Security updates still arrive directly against `main`. `main-gate` rejects a
Dependabot-authored promotion before the live-dev journey steps can receive a
test-account password, with an instruction to recreate the coordinated fix as
a human-owned PR against `dev`. The ordinary read-only CI and dependency review
still report on the bot PR; production promotion continues through the normal
`dev` to `main` path.

The `dependency-review` workflow uses GitHub's dependency graph to reject
pull requests that introduce high or critical vulnerabilities. Once this
workflow has reached default branch `main` and its check has run successfully,
make the `dependency-review` job required in both `dev` and `main` branch
protection. Do not add the required check before then: routine version-update
pull requests target `dev`, while security-update pull requests target `main`,
and both paths need the workflow to be active first. Existing vulnerabilities
are tracked by Dependabot alerts and security-update pull requests rather than
failing every unrelated change.

Deferred (add when the phase actually starts, not before):

- `contract.yml` — OpenAPI regen + diff. Add in P1 once `spec:emit` is wired.
- `visual-gate.yml` — screenshot diff. Add in P2 once shared primitives + first screens land.
- Per-phase exit gates (`p1-exit-gate.yml`, etc.) — prefer GitHub branch-protection required checks over standalone workflows.

`scripts/ci/__tests__/release-confidence-gates.test.sh` statically
pins these workflow contracts, including the explicit Bash boundary
and early diagnostic setup in
`scripts/ci/run-maestro-launch-smoke.sh`, and
`scripts/ci/__tests__/verify-deployed-sha.test.sh` exercises the
main-promotion SHA verifier against fake health responses, including
rejection of matching abbreviated SHAs. Both run from the PR-gated
`lint-typecheck.yml` job.

## Removal verification gates

When the v4 mobile / API replaces a legacy concept, a removal gate
ensures the legacy path is gone:

- `check-no-supabase.sh` — no `@supabase/*` import or `supabase.*`
  URL in `apps/`, `packages/`, `infra/`. (Covers JSON / TOML / YAML
  too, so kept as a grep gate rather than an ESLint rule.)
- `check-no-unistyles.sh` — no `react-native-unistyles` anywhere
  in `apps/`, `packages/`, or `infra/`. Same rationale as above
  (covers non-JS files).
- `check-scope-tests.sh` — every authed route has scope tests.
- `check-spec-drift.sh` — regenerates the OpenAPI spec + types and
  fails if anything would change, keeping `api-contract` in sync
  with `packages/api/src/routes/`.
- `check-maestro-appid.sh` — Maestro flows must reference
  `${MAESTRO_APP_ID}` rather than a hardcoded bundle id.
- `check-no-maestro-point-taps.sh` — Maestro flows must tap text,
  accessibility labels, or testIDs rather than device-dependent
  `point:` coordinates.
- `check-no-process-env-r2.sh` — R2 config is read through
  `env.R2_*` only (Pitfall 13 — no `process.env.R2_*` escape
  hatches that bypass DI).
- `check-no-process-env-rate-limit.sh` — same rule for rate-limit
  config (`env.RATE_LIMIT_*`).
- `check-usage-limit-wiring.sh` — every usage-limit-gated route
  has the limit middleware actually mounted (Pitfall 13 — DI stubs
  must not become the spec).

The full list runs from the root `lint` script in `package.json`
and is enforced by `lint-typecheck.yml`. On Windows, root lint runs
the shell gates through `scripts/run-bash-checks.cjs`, which selects
Git Bash instead of WSL so the checks reuse the Windows `node_modules`
tree. Keep new shell gates in that wrapper rather than chaining raw
`bash` from `package.json`.

The following gates were migrated to ESLint rules in
[`apps/mobile/.eslintrc.cjs`](../../apps/mobile/.eslintrc.cjs) so
they surface as editor squiggles, not just CI failures:

- `Alert.alert` outside `lib/dialogs/` → `no-restricted-imports` on
  `react-native#Alert` (Pitfall 12 / AGENTS.md hard rule #4).
- `process.env.EXPO_PUBLIC_*` reads (and `!` non-null assertions)
  outside `lib/env.ts` → `no-restricted-syntax` (Pitfall 5).
- Hex color literals (`#abc` / `#abcdef`) under `components/**` →
  `no-restricted-syntax` on `Literal` + `TemplateElement`
  (Pitfall 3).

These run in `lint-typecheck.yml`. Adding a new gate is encouraged
when a new pitfall surfaces.
