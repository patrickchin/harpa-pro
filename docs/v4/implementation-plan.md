# v4 implementation plan

> **Status:** roadmap and implementation record. Updated 2026-08-04.
> Read [`pitfalls.md`](pitfalls.md) and
> [`architecture.md`](architecture.md) first.
>
> This file does not show live deployment status. Use the current code,
> CI results, release notes, and health checks for release decisions.
> Each phase has a `plan-p<N>-*.md` task record.

## Phase overview

| #   | Name                                      | Current record                           | Focus                                                              |
| --- | ----------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| P0  | [Foundation](plan-p0-foundation.md)       | Complete                                 | Monorepo, packages, CI, fixtures, auth, and Neon branching.        |
| P1  | [API core](plan-p1-api-core.md)           | Complete                                 | REST API, scope enforcement, fixtures, and contract generation.    |
| P2  | [Mobile shell](plan-p2-mobile-shell.md)   | Complete                                 | Auth, navigation, NativeWind tokens, primitives, and core screens. |
| P3  | [Feature build](plan-p3-feature-build.md) | Feature work shipped; exit checks remain | Reports, notes, upload, voice, camera, PDF, and mobile E2E.        |
| P4  | [Hardening](plan-p4-hardening.md)         | In progress                              | Observability, performance, deployment, migrations, and recovery.  |
| P5  | [Beta and GA](plan-p5-beta-ga.md)         | In progress                              | Store distribution, rollout monitoring, and cutover.               |

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

For P3, the relevant `design-*.md` or `plan-*.md` file is the
specification source. If neither exists, the current implementation
and tests are the baseline. Read the existing JSX and NativeWind
classes before editing. Add a task-specific design doc before
making a design change. Visual review is manual on the iOS simulator.

## Verification targets

| Target                                                | Command or gate                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| API line coverage at least 90%                        | `pnpm --filter @harpa/api test:coverage`                                        |
| Mobile line coverage at least 80%                     | `pnpm --filter @harpa/mobile test`                                              |
| CLI unit and integration suites pass                  | `pnpm --filter @harpa/cli test` and `pnpm --filter @harpa/cli test:integration` |
| OpenAPI files match the runtime document              | `bash scripts/check-spec-drift.sh`                                              |
| The production-shaped mobile bundle exports           | `pnpm --filter @harpa/mobile bundle:smoke`                                      |
| Android launch smoke passes on relevant pull requests | `.github/workflows/e2e-maestro-testid-gate.yml`                                 |
| Full mobile journeys pass before a release            | Run the applicable `.maestro/` flows on the target platform.                    |
| Visual behavior matches the current specification     | Review manually on the target device or simulator.                              |
| Legacy Supabase imports remain absent                 | `bash scripts/check-no-supabase.sh`                                             |

The normal unit and integration lanes use AI replay. The path-filtered
`ai-live.yml` workflow and production-promotion journeys intentionally call
live providers. Treat those lanes as cost-bearing tests.

## Risks + mitigations

| Risk                               | Mitigation                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| OpenAPI drift                      | `scripts/check-spec-drift.sh` regenerates the spec and types, then checks the diff.       |
| RLS bypass                         | per-request scope tests + lint guard on raw `db` import                                   |
| Visual drift                       | manual review against the relevant v4 spec or current baseline on the iOS simulator       |
| LLM costs in CI                    | Keep normal lanes in replay. Restrict live calls to `ai-live.yml` and promotion journeys. |
| Hermes runtime gaps (`crypto`)     | `lib/util/uuid.ts` central + lint guard                                                   |
| Forgotten timeline note on uploads | integration test per upload kind                                                          |
| Invalid mobile env values          | `lib/config/env.ts` parses at module load, and unit tests cover the parser.               |
| Neon branch sprawl                 | cron deletes branches > 14 days old                                                       |
