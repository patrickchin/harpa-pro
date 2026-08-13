# Design — ponytail simplification stack

**Status:** Draft for an unmerged stacked pull request series.

## Goal

Reduce whole-repo complexity without changing product scope. The stack removes
dead tooling, dead assets, unused dependency edges, and duplicated local
models while keeping the current v4 API contract, auth boundaries, and
delivery workflows intact.

The confirmed audit baseline for this design is repository snapshot
`bf1c5409607d` on August 13, 2026. Implementation PRs still target the
current protected `dev` branch at merge time; `bf1c5409607d` is the design
baseline, not a request to rewind `dev`.

## Non-goals

- Remove the admin GitHub public repository panel.
- Remove or rename Cloudflare Pages workflows, including `dashboard-prod.yml`.
- Change Better Auth or dedicated-admin cookie policy.
- Replace `packages/design-tokens` or the dashboard token pipeline.
- Remove the documentation screenshot dialog or its current screenshot asset
  flow.
- Replace the dashboard's Immer-based report editing path.
- Rewrite or delete historical architecture, plan, bug, or legacy-reference
  docs that are kept as history.
- Add a new shared framework package just to hide local duplication.

## Explicitly retained

- The admin GitHub panel stays browser-side and unauthenticated.
- Pages workflows keep their current exact-SHA verification role.
- Dedicated admin and Better Auth cookie boundaries stay unchanged.
- `packages/design-tokens` remains the dashboard visual source.
- The docs screenshot dialog and current public screenshot registry remain.
- Dashboard report editing keeps Immer.
- Existing test seams remain: fixture replay/live splits, default-wiring
  integration tests, observer redaction tests, and Maestro testID gates.
- Historical docs remain in place even when current runtime references are
  removed.

## Current complexity to remove

1. Mobile `GeneratedSiteReport` plus `packages/report-core` duplicate
   `reports.ReportBody`, force `report-body-adapter.ts`, and keep a lossy
   second model alive.
2. The Generate Edit tab is gated off by default, unreachable in the normal
   product flow, and still carries route, flag, test, and doc overhead.
3. Maestro keeps three generations of assets at once: current modular
   journeys, older legacy flows, and `core-end-to-end.yaml` references that
   still describe the Edit tab path.
4. CLI commands repeat the same env, auth, client, header, request, and
   render delegation patterns in every handler.
5. `AdminOperations.tsx` owns too many responsibilities at once: session
   orchestration, browser GitHub polling, observer loading, copy mapping, and
   per-card rendering.
6. Server-side observer clients and AI provider adapters both hand-roll small
   transport concerns such as timeout, JSON parsing, and error normalization.

## Simplification principles

- Contract first. `@harpa/api-contract` owns wire shape. There must not be a
  second report schema.
- Delete before abstracting when a surface is unreachable or dead.
- Prefer narrow local helpers over new shared packages.
- Keep expand/contract discipline for files, workflows, and docs: remove
  references in the same PR that removes the target.
- Preserve current auth, deployment, and fixture-mode boundaries.
- Do not let test-only or debug-only branches define the architecture.

## Target architecture

- Report persistence, editing, rendering, and transport use
  `reports.ReportBody` from `@harpa/api-contract` as the only report document
  shape.
- Mobile keeps pure local helpers for view-specific derivations, but those
  helpers operate on `ReportBody` rather than a second schema package.
- The generate flow exposes only product-reachable tabs plus the existing
  developer Debug path. Manual report editing survives only where it is already
  reachable in the published/saved report experience.
- Maestro keeps only currently supported entrypoints: launch smoke, modular
  regression, release stress, account deletion, report review comments, store
  screenshots, and the shared helpers they still use.
- CLI command modules declare command-specific args and request intent, while
  shared execution, auth, and rendering delegation move into small local
  factories under `apps/cli/src/lib/`.
- Admin browser code stays in `apps/admin`; the only true API/admin shared
  core remains the contract in `@harpa/api-contract`.
- Observer transports and AI provider transports both narrow around bounded
  fetch helpers, but they do not collapse into a speculative cross-workspace
  framework.

## Stacked PR plan

### PR 1 — dead edges first

Remove dead tooling, dead assets, and unused dependency edges that do not
change runtime behavior.

- Delete unused package edges such as `@harpa/report-core` from workspaces that
  no longer import it.
- Prune dead references only when the same PR updates every workflow, doc, and
  test that still names them.
- Keep this PR free of runtime logic changes so it can be reverted safely.

Why first: it lowers noise for later refactors and proves which deletions are
truly independent.

### PR 2 — remove the unreachable Generate Edit surface

Delete the developer-only Generate Edit tab and its gating path.

- Remove the edit-tab flag from `apps/mobile/lib/config/dev-flags.ts`.
- Remove the developer-screen toggle and Edit-tab-only route/test branches.
- Keep the Debug tab and its current developer-only gate.
- Update docs and Maestro references that still mention the Edit tab as a live
  surface.

Why second: this deletes dead UI before the report-model migration and reduces
the number of mobile report surfaces that PR 3 must convert.

### PR 3 — converge mobile report handling on `ReportBody`

Replace the `report-core` plus adapter model with `reports.ReportBody`.

- Convert mobile report helpers, cards, saved-report flow, generate flow,
  autosave, photo placement, and PDF export to operate on `ReportBody`.
- Delete `apps/mobile/lib/reports/report-body-adapter.ts`.
- Delete `packages/report-core` once no workspace imports it.
- Remove stale workflow path filters that watch `packages/report-core/**`,
  while retaining the workflow identities and their current deploy contracts.

Why third: this is the main architectural cut. It removes the duplicate report
schema and its adapter once the unreachable Edit tab is already gone.

### PR 4 — Maestro cleanup and shared active-flow helpers

Cut Maestro down to the still-supported flows and helper paths.

- Rewrite active flows so they cover only reachable product surfaces after
  PRs 2 and 3.
- Retire `core-end-to-end.yaml` and `.maestro/legacy/*` only after the same PR
  removes all current doc and script references to them.
- Factor repeated report-surface assertions into shared current helpers, but do
  not add a new runtime package or resurrect the removed Edit path.

Why fourth: Maestro should follow the new reachable UI, not block the model
cleanup. Running it earlier would duplicate churn.

### PR 5 — CLI handler delegation

Reduce command boilerplate without changing the command tree or output
contract.

- Keep `apps/cli/src/lib/render.ts` as the human-output boundary.
- Make each Commander wrapper delegate to its existing pure command helper
  instead of duplicating the same request and rendering logic inline.
- Keep the short `getEnv()`, `requireToken()`, and client setup explicit in
  each command module; it is configuration, not a new abstraction boundary.
- Keep auth raw-fetch handling separate where OpenAPI does not apply.

Why fifth: it is independent of the mobile/admin work and should stay isolated
from higher-risk runtime changes.

### PR 6 — narrow API/admin shared cores

Split the admin operations surface into smaller browser-only modules and keep
the contract as the only real cross-workspace shared core.

- Break `AdminOperations.tsx` into local loaders, presentation helpers, and
  per-surface modules.
- Keep GitHub status fetching in `apps/admin`; do not move it server-side and
  do not add a GitHub token.
- Keep shared semantics in `packages/api-contract/src/schemas/operations.ts`.
- Avoid creating a new shared browser package unless at least two browser apps
  need the same implementation after the split.

Why sixth: it narrows a monolith without coupling it to the CLI or mobile
refactors.

### PR 7 — narrow AI provider and observer transports

Reduce server transport duplication without over-unifying distinct domains.

- Add one small observer transport helper inside `packages/api` for timeout,
  bounded fetch, JSON parsing, and normalized error mapping.
- Add one small provider transport helper inside `packages/ai-fixtures` for
  the same low-level concerns plus replay-safe diagnostics.
- Keep provider-specific request bodies, usage extraction, and redaction logic
  in their current domains.
- Do not create a speculative cross-workspace transport package unless both
  sides demonstrably need the same implementation after the refactor.

Why last: it touches the most failure-sensitive server boundaries and should
land only after the easier structural cleanup is done.

## Merge-order constraints

- PR 2 must land before PR 4. Maestro cleanup should follow the actual UI
  removal, not guess at it.
- PR 3 must remove `packages/report-core`, workspace dependencies, and related
  workflow/path-filter references atomically.
- PR 4 may delete `core-end-to-end.yaml` and `.maestro/legacy/*` only when the
  same PR clears current docs, scripts, and READMEs that still point at them.
- PR 5 is independent and can run in parallel with PR 6 if needed.
- PR 6 must preserve the admin GitHub browser fetch boundary and current cookie
  model.
- PR 7 must not change route contracts, env-var shape, replay/live mode
  semantics, or redaction guarantees.
- None of these PRs should introduce database migrations. If an implementation
  discovers a hidden schema dependency, stop and split that work into a new
  design review.

## Invariants per area

### Reports

- `reports.ReportBody` remains JSONB-compatible and wire-compatible.
- Dashboard report editing keeps Immer and `packages/design-tokens`.
- Manual edits still do not flip `needsRegeneration`.
- Photo placement stays owned by the persisted report body, not by a second
  view model.

### Mobile

- The Debug tab remains developer-gated.
- Saved-report editing remains reachable.
- Existing fixture-mode behavior and report PDF behavior stay intact.

### Maestro

- Keep `scripts/check-maestro-appid.sh` and
  `scripts/check-no-maestro-point-taps.sh` green.
- Keep launch smoke, regression, release stress, account deletion, report
  review comments, and screenshot flows alive.
- Do not keep a flow only because it is historical; keep it only if a current
  runbook still depends on it.

### CLI

- Command names, flags, exit codes, and human/JSON output stay stable.
- Raw auth flows stay outside the OpenAPI client.
- No new runtime dependency is added for command delegation.

### Admin and observers

- No observer route accepts new browser-controlled provider targets.
- Admin pages keep the dedicated cookie boundary and redaction guarantees.
- GitHub status remains public-browser data, not stored server-side.

### AI providers

- Replay/live/record semantics stay unchanged.
- Usage accounting and fixture hashing stay unchanged.
- Transport narrowing must not weaken secret redaction or diagnostic hygiene.

## Verification plan

Each PR needs targeted proof, not one giant final pass.

### PR 1

- Workspace install/build succeeds after dependency and asset deletion.
- `pnpm test:docs:links` stays green for doc/reference cleanup.
- Changed workflow/path-filter tests remain green.

### PR 2

- Mobile unit tests for the developer screen and generate flow remain green.
- The Maestro testID gate remains green.
- No active doc still tells the reader to use the Generate Edit tab.

### PR 3

- `pnpm --filter @harpa/api-contract test`
- `pnpm --filter @harpa/api-contract build`
- Targeted mobile report tests covering rendering, autosave, photo placement,
  and PDF export.
- Dashboard report workspace tests remain green.
- Workflow/path-filter tests prove current deploy lanes still trigger on the
  right files after `packages/report-core` deletion.

### PR 4

- `.maestro/README.md` and current runbooks match the remaining entrypoints.
- Maestro lint/policy scripts remain green.
- At least one active regression path and the launch smoke path are rerun.

### PR 5

- `pnpm --filter @harpa/cli test`
- `pnpm --filter @harpa/cli test:integration`
- Help and render snapshot tests remain stable unless the output contract
  intentionally changed, which this stack does not propose.

### PR 6

- `apps/admin` unit tests stay green.
- Existing admin browser checks remain green.
- Redaction and dedicated-cookie tests remain unchanged in behavior.

### PR 7

- Observer unit and integration tests remain green, especially redaction,
  timeout, and not-configured cases.
- `pnpm --filter @harpa/api test`
- AI replay tests remain green.
- Live-AI path filters remain intact; no accidental widening of `ai-live`
  triggers.

## Rollout and rollback

This stack should merge as seven ordinary PRs against `dev`, each with docs in
the same PR. No PR depends on production-only data migration. Rollback is
therefore ordinary Git revert per slice.

- Revert PR 1, 5, 6, or 7 independently if they regress behavior.
- Revert PR 2 as a whole if Edit-path removal unexpectedly breaks a reachable
  screen.
- Revert PR 3 as a whole if the `ReportBody` cutover regresses rendering,
  autosave, or PDF behavior; do not partially restore `packages/report-core`.
- Revert PR 4 as a whole if active Maestro coverage regresses; do not restore
  legacy flows without also restoring the references that call them current.

## Recommendation

Use the seven-PR order above. The key architectural choice is to delete the
unreachable Generate Edit surface first, then make `reports.ReportBody` the
only report document shape. Everything else becomes smaller, safer, and easier
to verify after that cut.
