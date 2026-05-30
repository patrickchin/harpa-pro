# Data-layer / drift audits — backlog

This file is the running TODO list for cross-layer audits that follow
the same shape as a typical Pitfall — a central rule with silent
escape hatches that lint / typecheck can't see. Pick one per PR;
strike it through when done.

Each PR that closes an item should add a regression gate (test or
lint rule) so the audit doesn't have to be re-run.

## Mobile data / state layer
- [x] **#1 Raw `useQuery`/`useMutation` callers.** *Audit 2026-05.*
  Clean — every TanStack Query call lives in `lib/api/hooks.ts`,
  `lib/api/optimistic.ts`, the generator, or tests. No new gate
  needed; existing INVALIDATIONS coverage test already breaks if a
  generated mutation lacks a rule.
- [ ] **#2 Per-call `staleTime` / `gcTime` overrides.** Should be
  rare and justified — audit for sprinkled tuning.
- [ ] **#3 `enabled` gating on param-dependent queries.** Missing
  guards cause 404 spam on first render when params are still
  resolving.
- [ ] **#4 `refetchOnWindowFocus` / `refetchOnReconnect` in RN.**
  These don't have web semantics on React Native. Audit for callers
  that set them assuming they do.
- [ ] **#5 Imperative `request()` callers outside hooks.** Confirm
  every such caller routes invalidation through
  `runInvalidations()` or `invalidateAfterFileUpload()`. The voice
  pipeline and upload queue are done; verify any newer additions.
- [ ] **#6 Error handling uniformity.** `classify(error)` / `ApiError`
  used everywhere, or direct `error.message` reads in some surfaces?
- [ ] **#7 Mutation success toasts / haptics.** Centralized helper or
  sprinkled per-screen?

## Auth & request scope
- [ ] **#8 JWT claim parsing outside `lib/auth`.**
- [x] **#9 Per-request scoped-role middleware coverage.** *Audit 2026-05.*
  Clean — every authed route registered via `createRoute({...})`
  pairs with `middleware: [withAuth()]`. Added regression gate at
  `packages/api/src/__tests__/auth-coverage.test.ts` that iterates
  `app.routes` and asserts each is either on the public allowlist
  or 401s without `Authorization`.
- [ ] **#10 Test-account password bypass gated by env flag.** Confirm
  not reachable in prod builds.

## API surface drift
- [ ] **#11 Zod / OpenAPI / Drizzle drift.** *Partially audited 2026-05.*
  Tightened `note` Zod schema (dropped `.optional()` on always-present
  nullable fields). Remaining items:
  - Report schema advertises `pdfUrl: string | null` while DB stores
    `pdfFileId`; service hardcodes `pdfUrl: null` pending P1.7. The
    contract advertises a field that's permanently null until the
    signed-URL minting lands.
  - Files schema is clean.
  - Other resources (projects, users, settings) not yet diffed.
- [ ] **#12 Response envelopes.** Pagination shape (`{ items, nextCursor }`)
  vs bare arrays vs `{ data }`. Should be one shape.
- [ ] **#13 Error response envelope shape consistency.**
- [ ] **#14 HTTP status codes** — 201 on create, 204 on delete,
  409 on conflict.

## File uploads / R2
- [ ] **#15 Direct-to-R2 vs streaming-through-API.** No route should
  stream bodies through the API.
- [ ] **#16 Signed URL TTL + scope.** Same generator everywhere.
- [ ] **#17 Orphan-file cleanup on failed note creation.**

## AI providers
- [ ] **#18 All provider calls route through `packages/ai-fixtures`.**
  No direct SDK imports in route handlers.
- [ ] **#19 Token-cost accounting incremented exactly once per call.**

## Env / config
- [ ] **#20 `EXPO_PUBLIC_*!` lint rule actually wired** and failing
  CI on violations.
- [ ] **#21 `lib/env.ts` Zod coverage.** Audit for `process.env.*`
  reads outside the env module.

## Tests
- [ ] **#22 DI-stub anti-pattern (Pitfall 13).** Every collaborator
  factory needs a default-wiring integration test.
- [ ] **#23 Snapshot tests on unstable shapes.** Flake source.
- [ ] **#24 Testcontainers DB reuse.** Each integration test gets a
  clean DB.
