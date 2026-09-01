# Testing strategy

> Resolves [Pitfall 1](pitfalls.md#pitfall-1--p1-done-without-real-api-tests),
> [Pitfall 2](pitfalls.md#pitfall-2--llm-fixtures-retrofitted-not-designed-in),
> [Pitfall 3](pitfalls.md#pitfall-3--mobile-shell-drifted-from-the-visual-design),
> [Pitfall 10](pitfalls.md#pitfall-10--coverage--docs--tests-in-p5p6p7-instead-of-inline).

## Test pyramid

```
                    ▲
                    │
                 Maestro flows
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

- Run the relevant workspace suite locally. CI runs unit tests for
  code changes and for pushes to `dev` or `main`.
- Mobile tests mock hooks, native modules, and request boundaries per
  test. The mobile workspace does not include an MSW harness.
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

Scope tests live in `packages/api/src/__tests__/scope/`. The intended
route contract includes these cases:

1. own-row read/write succeeds.
2. cross-actor read returns empty / 404.
3. cross-actor write returns 403/404.

`scripts/check-scope-tests.sh` checks that each authenticated route
module has a non-empty matching scope-test file. It does not inspect
the cases inside that file. Reviewers must verify the assertions.

### Contract tests

- `packages/api/src/__tests__/contract.test.ts` compares Hono's
  generated OpenAPI document with the committed contract. It also
  checks registered route patterns and authenticated security metadata.
- Route integration tests validate response behavior. The contract
  test does not execute every handler or validate captured responses.

### Fixture-replay tests for AI routes

Each AI-touching route has a test that:

1. Sends a JSON request body with `fixtureName: <name>`.
2. The server uses the name only after it has selected replay mode.
3. Asserts response matches the recorded fixture.

### Live AI regression lane

- `ai-live.yml` runs the live provider tests when prompts, provider
  wiring, report schemas, or the live-test harness changes. It also
  supports manual dispatch.
- Each real provider call has a 120-second test budget inside the
  workflow's 10-minute job budget. Provider timeouts still fail the
  lane; schema and model-routing assertions are never retried.
- The workflow fetches provider keys from Doppler. Fork pull requests
  skip the job because they cannot read the Doppler token.
- Pull requests to `main` also run live-AI development journeys in
  `main-gate.yml`.
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
  command has a 600-second ceiling.
- Before installing the APK, the runner calls the shared
  `scripts/maestro/prepare-android-emulator.sh` preflight. It refuses physical
  devices, writes Android's global `hide_error_dialogs=1` setting on the
  disposable emulator, reads it back, and exits unless the value is exactly
  `1`. Local Android emulator runs call the same preflight after boot. This
  boundary suppresses recurring system crash and ANR dialogs before they can
  own Maestro's accessibility surface.
- After clearing app state, the flow waits up to 30 seconds for either
  the Expo Dev Launcher home screen or Android's known Quickstep ANR
  dialog. It chooses the dialog's semantic `Wait` action conditionally,
  then requires the `Development Build` heading within 30 seconds before
  opening the Metro deep link. It performs the same conditional recovery
  once after `openLink`: a 180-second union wait observes Quickstep,
  the Metro server row, or app UI before conditional recovery and server
  selection. A second 180-second wait then covers a cache-empty bundle that
  starts only after the server row is selected, before the app assertions.
- Shared-development device runs expose the host-side API, R2, and auth helpers
  through `adb reverse`; loopback binding is not an authorization boundary.
  `dev-e2e-api-proxy.cjs` accepts only relative paths and constructs outbound
  requests from the configured HTTPS API hostname plus that path. JSON response
  rewriting and `dev-e2e-r2-proxy.cjs` share one signed-R2 validator: strict
  Cloudflare R2 hostname suffixes, SigV4 fields, no credentials/custom ports,
  and `GET|HEAD|PUT` only. The R2 proxy uses HTTPS directly and does not follow
  redirects. A PR-gated Node test starts the real server factories and proves
  rejected inputs cannot reach a loopback sentinel.
- Both semantic Quickstep `Wait` fallbacks remain even with global dialog
  suppression. They recover a dialog already present at either transition;
  the flow still fails closed unless the final `input-email` testID renders.
- Local fixture clear-state entrypoints share
  `.maestro/helpers/launch-local-dev-client.yaml`. It observes Expo native
  readiness before sending `openLink`, recovers the known Quickstep ANR at
  both transitions, then selects the emulator's discovered
  `http://10.0.2.2:8081` row if the link leaves the Development Build picker
  visible. Its post-link paths allow three minutes for a cache-empty local
  Metro bundle. Modular regression, legacy core, account-deletion, and
  screenshot entrypoints cannot drift to separate launch preludes; the
  standalone photo-placement flow reaches it through modular auth. The
  shared-dev deployment keeps its port-8082 target-specific prelude.
- The PR APK targets only the emulator's `x86_64` ABI instead of
  compiling the three unused Android ABIs. Gradle dependencies are
  restored from a cache keyed by the lockfile and mobile prebuild
  inputs.
- Before the emulator starts, CI applies the runner action's
  documented world-readable/writable `/dev/kvm` udev rule so hosted
  Ubuntu uses hardware acceleration instead of falling back to
  `-accel off`.
- The launch smoke does not call AI routes. Its fixture-input flag
  replaces native input where needed but does not control API mode.
- Full regression and native-input flows remain explicit local /
  release checks; the PR smoke proves native build, Metro startup,
  installation, launch, and a rendered sign-in control.
- After fast-forwarding, local Maestro setup uses `docker compose up -d
--build` after resetting volumes. `mo up` performs that reconciliation on
  every invocation, even when the existing stack is healthy, with a separate
  15-minute build ceiling. API migrations are image-baked, so a new database
  on a cached image can still expose an old schema. Unit and policy tests pin
  the build command and derive the newest SQL migration, requiring both local
  Compose head pins to match it. The local migration one-shot then arms the
  storage-lifecycle rollout with zero grace before seeding or API startup;
  unlike a rolling deployment, a disposable local stack has no older machine
  or outstanding presign to drain.
- Fixture-mode saved reports prefer the API row's persisted body. The static
  sample is only a body-absent rendering fallback, so finalized edits and
  attachment placements remain observable in local end-to-end tests.
- Active core and photo journeys share
  `.maestro/helpers/wait-for-auto-regeneration.yaml`. The generate route owns
  dirty-draft regeneration. A local operation counter remains pending from
  upload enqueue through awaited notes/report refetches, and tracks overlapping
  uploads independently. Failed completions latch an error; gallery, camera,
  and inline failed-tile retry paths clear it only after successful persistence
  and canonical refetch, rather than when a picker merely opens or cancels.
  Active and failed image jobs are also derived from the live report queue, so
  success from one concurrent retry cannot erase another failure. Failed-tile
  dismissal routes through the same owner, while an intentional in-flight abort
  is excluded from retryable failures and still precedes canonical refetch.
  Removing a serial queue job settles a pending promise immediately; active
  collaborators settle their own aborted promise before the refetch boundary.
  Completed jobs persist their canonical note linkage and remain pending until
  a route observer refetches both report heads after that committed `noteId`.
  The acknowledgement does not require the newest note to appear in the
  timeline's oldest-first first page. Photo placement is another report-body write: its pending
  and error states block generation/finalize actions and the current-generation
  marker, and its response advances the expected body version synchronously.
  Regression module 08 delegates before opening text-note row actions and
  again after note deletion before draft actions. The shared single-photo
  capture helper delegates after every upload, so module 10c cannot start the
  next native attachment Modal while the prior canonical refetch and
  regeneration still load the UI thread. The helper gives `dialog-sheet` a
  bounded 20-second render budget before requiring its camera action. Modules
  11 and 17 delegate rather than tapping auto-generation controls; placement
  repeats the helper after its optimistic write.
  Maestro then requires the clean API
  generation timestamp to cover the canonical note-change clock, requires the
  mutation to settle, and waits for the stable, enabled `btn-finalize-report`
  postcondition. Manual-regeneration coverage uses the same current-generation
  marker. Optimistic note mutations, temporary note rows, report/notes
  refetches, and synchronization errors also hold the marker pending, so an
  earlier clean generation cannot satisfy a newly added note. The legacy core
  journey additionally waits for its provider-owned voice pipeline to expose a
  saved title before entering the readiness gate. Active journeys do not
  conditionally tap a transient Generate / Update action.
- The off-screen Edit pane keeps its generation-opacity wrapper
  non-collapsable. This prevents Fabric from flattening its native host while
  the same generating-to-current mount batch updates the report form. See
  [`design-generate-pane-fabric-stability.md`](design-generate-pane-fabric-stability.md).
- The non-fixture native-input smoke accepts both valid destinations after
  deleting its draft. If Back collapses to the Projects index, it reopens the
  current project before shared project cleanup; recorder and camera assertions
  therefore cannot pass only to fail on a router-stack assumption.
- Native camera journeys use
  `.maestro/helpers/wait-for-camera-shutter-ready.yaml` rather than sleeping.
  `CameraCapture` keeps the shutter disabled through size discovery and, on
  Android, through CameraX's picture-size rebind. The enabled state also
  requires the ordinary native capture promise to produce a JPEG URI or reject;
  the ref-backed lock serializes shutters and keeps Done from committing an
  incomplete list. Android lens flips also
  invalidate pending readiness discovery; iOS retains readiness because its
  device update emits no second ready event. Burst journeys wait again between
  captures, and static policy pins each wait before its matching shutter tap.
  See
  [`design-camera-native-readiness.md`](design-camera-native-readiness.md).
- Saved-report photo verification scrolls to a centered photo tile before
  asserting the surrounding grid. Android can report only the visible sliver
  of a tall parent card as its accessibility bounds, causing Maestro to accept
  `visibilityPercentage: 100` while the card's children are still below the
  viewport. Static policy pins the leaf-before-container ordering and centered
  positioning.
- Report-card edit controls must also remain above the Generate screen's sticky
  recorder. For a leaf entering from below, do not use Maestro's unbounded
  `centerElement` action: it can find the fully visible control, swipe it above
  the viewport, and continue in the wrong direction. Workers and Materials edit
  coverage stop at full visibility, apply one coordinate-bounded upward
  gesture, and wait for settlement before the semantic tap. The saved material
  value is then positioned with a non-centering leaf scroll before assertion.
  Static policy pins these local sequences without banning valid centering
  elsewhere.

### Docs site (Playwright)

- `apps/site/tests/docs.spec.ts` covers local search, empty results, guide
  traversal, responsive navigation, internal links, assets, duplicate ids,
  and the branded 404 against the production static build.
- `apps/site/tests/header.spec.ts` proves the unreleased dashboard is absent
  from desktop and mobile public navigation and retains the mobile-overflow
  check.
- `site-preview.yml` also waits for the native Cloudflare Git deployment's
  exact-SHA marker and verifies one checked-in legacy redirect.
- `scripts/ci/verify-pages-deployment.sh` allows 7,200 seconds for the native
  queue. All six site, admin, and dashboard `dev` or pull-request marker jobs
  have 150-minute outer limits. The Pages policy test pins both budgets and the
  exact commit-and-branch checks. Production jobs retain their 20-minute outer
  limits, which remain their effective maximum. This covers an observed stack
  of account-wide Pages waves that kept an exact site build incomplete beyond
  the former 75-minute inner limit and the admin build beyond the former
  90-minute job limit. All three stable aliases settled after about 93 minutes.

### Dashboard (Playwright)

- `test:e2e` keeps broad mock-backed browser coverage.
- `test:e2e:live` runs one serial Chromium journey against the stable
  `pr-<n>.harpa-pro-dashboard.pages.dev` alias and its isolated API.
- The workflow first verifies the Fly API at the immutable pull-request head
  SHA deployed by `pr-preview.yml`.
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

## Verification workflows

These are the main test and review workflows. Deployment workflows are
documented in [`arch-ops.md`](arch-ops.md).

| Workflow                      | Trigger                                                       | Gate                                                                                                   |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `lint-typecheck.yml`          | Pull requests and pushes to `dev` or `main`, with path gating | Workspace lint, typecheck, repository policy gates, and CI policy tests                                 |
| `unit.yml`                    | Pull requests and pushes to `dev` or `main`, with path gating | `pnpm test`                                                                                            |
| `api-integration.yml`         | API-relevant pull requests and pushes                         | Combined API unit and Testcontainers coverage at 90% lines                                             |
| `cli.yml`                     | CLI-relevant pull requests and branch pushes                  | CLI typecheck, lint, tests, help drift, and integration journeys                                       |
| `e2e-maestro-testid-gate.yml` | mobile-relevant PR / push                                     | testID policy, Metro bundle leakage, and bounded Android Maestro launch smoke with failure diagnostics |
| `dependency-review.yml`       | Pull requests                                                 | Reject newly introduced high or critical dependency vulnerabilities                                    |
| `ruby-security.yml`           | Ruby dependency change                                        | Frozen Bundler install and Fastlane load on Ruby 3.2.11 and 3.4.10                                     |
| `ai-live.yml`                 | Matching same-repository changes or manual dispatch           | Cost-bearing live report-model schema tests                                                            |
| `main-gate.yml`               | Pull requests to `main`                                       | Exact development SHA and deployed journey checks, including live AI                                   |
| `pr-preview.yml`              | PR open / push                                                | Credential-free path/migration guards; human-owned PR preview lifecycle                                |
| `pages-preview-ref.yml`       | human-owned same-repo PR                                      | Mirror/delete the exact `pr-N` Git ref without checking out PR code                                    |
| `mobile-ota-pr.yml`           | mobile-relevant PR                                            | Human-owned same-repo PR OTA publication                                                               |
| `admin-preview.yml`           | admin-relevant PR                                             | Credential-free checks plus exact-SHA native Pages preview verification                                |
| `admin-dev.yml`               | push to `dev`                                                 | Verify the exact SHA and routes on the native admin `dev` deployment                                   |
| `admin-prod.yml`              | push to `main`                                                | Verify the exact SHA and routes on both native admin production hostnames                              |
| `site-preview.yml`            | PR to `dev` or `main`                                         | Credential-free checks plus exact-SHA native Pages preview verification                                |
| `site-dev.yml`                | push to `dev`                                                 | Verify the exact SHA on the native public-site `dev` deployment                                        |
| `site-prod.yml`               | push to `main`                                                | Verify the exact SHA on every native public-site production hostname                                   |
| `dashboard-preview.yml`       | PR to `dev` or `main`                                         | Verify exact head-SHA Git preview, SPA routing, and live browser checks on the stable alias            |
| `dashboard-dev.yml`           | push to `dev`                                                 | Verify the exact SHA and SPA routes on the native dashboard `dev` deployment                           |
| `dashboard-prod.yml`          | push to `main` with `DASHBOARD_PRODUCTION_ENABLED=true`       | Verify the exact SHA and SPA routes on approved dashboard production hostnames                         |

### Dependency security automation

GitHub reads [`.github/dependabot.yml`](../../.github/dependabot.yml) from
the repository's default branch, `main`. It checks the root pnpm workspace,
the root Bundler/Fastlane graph, and GitHub Actions weekly. Routine
version-update pull requests target `dev`. Compatibility-coupled Better Auth,
React, Astro/Vite, Drizzle, AWS SDK, and TypeScript-ESLint packages update as
coordinated stacks. The broad npm production/development groups accept patches
only, so unrelated minor updates remain focused. The Better Auth CLI package
`auth` moves with the complete Better Auth stack; its semver-major updates,
like the other Better Auth packages, require a reviewed stack migration. Expo
and React Native packages are ignored here: until a reviewed SDK migration
changes the tested matrix, Expo Doctor and `expo install` own the React
runtime/renderers and the Babel-major compatibility boundary.

The path-scoped `ruby-security` workflow validates each Ruby dependency change
with Bundler 2.6.9 on Ruby 3.2.11 (the supported EAS Ruby line) and Ruby 3.4.10
(the checked-in local version). Both jobs load the Fastlane configuration after
checking the patched dependency floors.

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

There is no `contract.yml` or `visual-gate.yml`. The root lint command
runs `scripts/check-spec-drift.sh`. Visual review remains manual.

`scripts/ci/__tests__/release-confidence-gates.test.sh` statically
pins these workflow contracts, including the explicit Bash boundary
and early diagnostic setup in
`scripts/ci/run-maestro-launch-smoke.sh`, and
`scripts/ci/__tests__/verify-deployed-sha.test.sh` exercises the
main-promotion SHA verifier against fake health responses, including
rejection of matching abbreviated SHAs. Both run from the PR-gated
`lint-typecheck.yml` job.

## Repository policy gates

The root lint and CI jobs run focused checks for repository contracts
that are not covered by workspace linters:

- `check-scope-tests.sh` — every authenticated route module has a
  non-empty matching scope-test file.
- `check-spec-drift.sh` — regenerates the OpenAPI spec + types and
  fails if anything would change, keeping `api-contract` in sync
  with `packages/api/src/routes/`.
- `check-maestro-appid.sh` — Maestro flows must reference
  `${MAESTRO_APP_ID}` rather than a hardcoded bundle id.
- `check-no-maestro-point-taps.sh` — Maestro flows must tap text,
  accessibility labels, or testIDs rather than device-dependent
  `point:` coordinates.
- `check-native-input-smoke.sh` — native input coverage cannot rely on
  the fixture recorder.
- `check-no-process-env-r2.sh` — R2 config is read through
  `env.R2_*` only (Pitfall 13 — no `process.env.R2_*` escape
  hatches that bypass DI).
- `check-no-process-env-rate-limit.sh` — same rule for rate-limit
  config (`env.RATE_LIMIT_*`).
- `check-usage-limit-wiring.sh` — every usage-limit-gated route
  has the limit middleware actually mounted (Pitfall 13 — DI stubs
  must not become the spec).

The root `lint` script runs the gates listed above through
`scripts/run-bash-checks.cjs`. `lint-typecheck.yml` also runs
`check-mobile-lib-flat.sh`, while the Maestro workflow runs
`check-maestro-testids.sh`. On Windows, the wrapper selects Git Bash
so the checks reuse the Windows `node_modules` tree.

The following gates were migrated to ESLint rules in
[`apps/mobile/.eslintrc.cjs`](../../apps/mobile/.eslintrc.cjs) so
they surface as editor squiggles, not just CI failures:

- `Alert.alert` outside `lib/dialogs/` → `no-restricted-imports` on
  `react-native#Alert` (Pitfall 12 / AGENTS.md hard rule #4).
- `process.env.EXPO_PUBLIC_*` reads (and `!` non-null assertions)
  outside `lib/config/env.ts` → `no-restricted-syntax` (Pitfall 5).
- Hex color literals (`#abc` / `#abcdef`) under `components/**` →
  `no-restricted-syntax` on `Literal` + `TemplateElement`
  (Pitfall 3).

These run in `lint-typecheck.yml`. Adding a new gate is encouraged
when a new pitfall surfaces.
