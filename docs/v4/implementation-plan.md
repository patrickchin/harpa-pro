# v4 Implementation Plan

> **Status**: planning. Read [`pitfalls.md`](pitfalls.md) and
> [`architecture.md`](architecture.md) first.
>
> This is the master phase plan. Each phase has its own
> `plan-p<N>-*.md` with task-level breakdown.

## Phase overview

| # | Name | Focus | Exit gate |
|---|---|---|---|
| P0 | [Foundation](plan-p0-foundation.md) | Monorepo, packages, CI, fixtures, auth, Neon branching | All scaffolds compile; `ai-fixtures` works; better-auth OTP integration test green; Neon branch script tested in CI; visual gate workflow exists. |
| P1 | [API Core](plan-p1-api-core.md) | All REST endpoints **with tests + scope + fixtures** | 100% routes implemented; ≥ 90% line coverage; per-request scope tests for every authed route; fixture replay covers every AI route; OpenAPI ↔ code in sync. |
| P2 | [Mobile Shell](plan-p2-mobile-shell.md) | Auth, nav, NativeWind tokens, primitives, **screen ports from `../haru3-reports/apps/mobile@dev`** | Auth flow + projects list ported and reviewed manually against canonical source; primitives locked + snapshot-tested; dev-gallery (`app/(dev)/`) renders every screen with mock props; `lib/env.ts` + lint guards in place. |
| P3 | [Feature Build](plan-p3-feature-build.md) | Every screen from `../haru3-reports/apps/mobile@dev` ported, each with tests + Maestro flow | Every screen ports cleanly with manual visual review; Maestro full journey green; upload + voice + camera + PDF pipelines working end-to-end through fixtures. |
| P4 | [Hardening](plan-p4-hardening.md) | Sentry, perf, deploy, prod migrations | Fly prod + Neon prod live; Sentry catching test crashes; PDF byte-equivalent to mobile-old reference samples; cold-start < 2 s; bundle ≤ v3 baseline. |
| P5 | [Beta + GA](plan-p5-beta-ga.md) | TestFlight, Play internal, gradual rollout | App store builds approved; rollout monitor wired; cutover. |

## Order of execution

Strictly sequential through P0 → P1 → P2. P3 can parallelise across
screens once primitives are locked. P4 starts during P3 for the
deploy + observability pieces but cannot finish until P3 ships.

## Why no "P5 testing phase"?

v3 had P5 = testing, P6 = migration, P7 = E2E. That's exactly the
mistake [Pitfall 10](pitfalls.md#pitfall-10--coverage--docs--tests-in-p5p6p7-instead-of-inline)
warns about. v4 ships tests, docs, and cleanup **inside** each
phase. There is no "tests later" phase.

## Per-phase commit cadence

Each commit targets one of:

- one route + its tests (P1),
- one primitive + its snapshot (P2),
- one screen + its behaviour test + Maestro flow (P3),
- one infra concern (P4: Sentry, Fly prod, EAS prod, etc.).

Big-bang commits like v3's `feat(mobile-v3): complete P3 feature
build — all screens and domain logic` are not allowed.

## Acceptance contract

For P3, each screen's acceptance is the matching screen in
`../haru3-reports/apps/mobile` on branch `dev`. Read the JSX +
Tailwind classes from there and port them directly (both apps run
NativeWind v4 — the markup copies across). Only the data layer
changes (legacy Supabase queries → v4 API contract hooks).
Visual review is manual against the canonical source.

## Success metrics

| Metric | Target | Measure |
|---|---|---|
| Source files (excl. tests) | ≤ 200 across `apps/mobile/src/` + `packages/api/src/` | `find … -name '*.ts' -o -name '*.tsx' \| grep -v __tests__ \| wc -l` |
| Test coverage | ≥ 90% API, ≥ 80% mobile | `pnpm test -- --coverage` |
| Maestro flows | All green on iOS + Android | `pnpm test:e2e` |
| Visual diff | n/a — manual review against `../haru3-reports/apps/mobile@dev` | manual |
| API p95 latency | < 200 ms | Fly metrics |
| Cold start | < 2 s | Maestro `assertVisible` timing |
| Bundle size | ≤ v3 baseline | EAS build artifacts |
| Real LLM calls in CI | 0 | grep audit |
| Supabase imports | 0 | `check-no-supabase.sh` |

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| OpenAPI drift | `p1-exit-gate.yml` regen + diff |
| RLS bypass | per-request scope tests + lint guard on raw `db` import |
| Visual drift | manual review against `../haru3-reports/apps/mobile@dev` per screen; dev-gallery makes side-by-side check trivial |
| LLM costs in CI | fixtures-first, `AI_LIVE` unset in CI, audit gate |
| Hermes runtime gaps (`crypto`) | `lib/uuid.ts` central + lint guard |
| Forgotten timeline note on uploads | integration test per upload kind |
| Auth env vars missing in release builds | `lib/env.ts` Zod parse at startup; CI parses `.env.example` |
| Neon branch sprawl | cron deletes branches > 14 days old |
