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

> **No automated screenshot diffs.** Visual review is manual against
> the canonical port source at `../haru3-reports/apps/mobile@dev`,
> aided by the in-app dev gallery (`app/(dev)/`).

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
- Coverage gate: ≥ 90% lines on `packages/api/src/`.
- CI matrix runs the suite against Postgres 15 and 16.

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

### Mobile visual review

- Manual, in the iOS simulator, side-by-side with the canonical
  source at `../haru3-reports/apps/mobile@dev`.
- The dev gallery (`app/(dev)/`) makes this a tap-through check:
  no auth, no API, just the screen body with mock props.
- There is no automated diff and no `pnpm visual:diff` script.
  Cosmetic drift is caught by reviewer eye; it is still a P0 bug.

### Maestro E2E

- `apps/mobile/.maestro/` contains the flows.
- `appId` is read from `MAESTRO_APP_ID` (Pitfall 9).
- Runs on iOS sim + Android emu in CI matrix.
- AI calls go through replay mode automatically — `:mock` build
  ships fixtures.
- All flows pass before P3 exit.

### Docs site (Playwright)

- Smoke test that the docs site builds and the in-app guides
  render. Lightweight — a few specs.

## CI workflows

| Workflow | Trigger | Gate |
|---|---|---|
| `lint-typecheck.yml` | every push | ESLint + tsc clean across the workspace |
| `unit.yml` | every push | `pnpm test:unit` green |
| `api-integration.yml` | every push | Testcontainers suite green at ≥ 90% line coverage |
| `contract.yml` | every push | OpenAPI regen + diff clean; contract tests green |
| `mobile-build.yml` | every PR | Expo prebuild + Metro bundle clean |
| `e2e-maestro.yml` | every PR | Maestro flows pass on iOS + Android |
| `pr-preview.yml` | PR open / push | Neon branch + Fly preview deploy |
| `p1-exit-gate.yml` | PRs labelled `phase/p1-exit` | All P1 acceptance criteria |
| `p2-exit-gate.yml` | …`phase/p2-exit` | … |
| `… per phase` | | |

## Removal verification gates

When the v4 mobile / API replaces a legacy concept, a removal gate
ensures the legacy path is gone:

- `check-no-supabase.sh` — no `@supabase/*` import or `supabase.*`
  URL in `apps/`, `packages/`, `infra/`.
- `check-no-unistyles.sh` — no `react-native-unistyles` outside
  `docs/legacy-v3/`.
- `check-no-alert-alert.sh` — no `Alert.alert(` outside
  `apps/mobile/lib/dialogs/`.
- `check-scope-tests.sh` — every authed route has scope tests.
- `check-no-process-env-bang.sh` — no `process.env.EXPO_PUBLIC_*!`
  outside `apps/mobile/lib/env.ts`.
- `check-no-hex-colors.sh` — no `#xxxxxx` literals in
  `apps/mobile/components/**`.

These run in `lint-typecheck.yml`. Adding a new gate is encouraged
when a new pitfall surfaces.
