# Mobile v3 + REST API Implementation Plan

> **Status**: In progress — P0-P3 largely complete, P1 stubs + P3 wiring remain
>
> **Last updated**: 2026-05-11
>
> **Reference**: [`docs/v3/architecture.md`](./architecture.md)

This document breaks down the v3 implementation into phases with specific tasks, dependencies, and acceptance criteria. Tasks are sized for delegation to coding agents.

---

## Phase Overview

| Phase | Name | Duration | Dependencies | Key Deliverables |
|-------|------|----------|--------------|------------------|
| P0 | Foundation | 1 week | None | Packages scaffolded, OpenAPI spec, CI |
| P1 | API Core | 2 weeks | P0 | All REST endpoints, contract tests |
| P2 | Mobile Shell | 1 week | P0 | Auth, navigation, design system |
| P3 | Feature Build | 3 weeks | P1, P2 | All screens, upload/voice/camera pipelines |
| P4 | E2E & Polish | 2 weeks | P3 | Maestro flows, styling parity, bug fixes |
| P5 | Testing | 1 week | P4 | Integration tests, component tests, removal gates |
| P6 | Migration | 2 weeks | P5 | Deploy, rollout, rename, config rewrite, docs rewrite |

**Total estimated duration**: 12 weeks

## Phase Details

- **[P0: Foundation](./plan-p0-foundation.md)** — Scaffold packages, OpenAPI spec, CI pipelines, Drizzle schema alignment.
- **[P1: API Core](./plan-p1-api-core.md)** — All REST endpoints (auth, projects, reports, notes, files, voice, rate limiting) with contract tests.
- **[P2: Mobile Shell](./plan-p2-mobile-shell.md)** — Auth flow, Expo Router navigation, Unistyles design system, API client setup.
- **[P3: Feature Build](./plan-p3-feature-build.md)** — All screens: projects, reports, notes, upload queue, files/camera pipelines, voice note pipelines, profile, PDF export.
- **[P4: E2E & Polish](./plan-p4-e2e-polish.md)** — Maestro flow migration, UI/styling parity with mobile-old, bug fixing, performance optimization. **P4.5 exit gate must pass before P5.**
- **[P5: Testing](./plan-p5-testing.md)** — API integration tests (Testcontainers), mobile component tests (MSW), contract tests (OpenAPI), Maestro E2E gate, removal verification gates.
- **[P6: Migration](./plan-p6-migration.md)** — Fly.io deploy, mobile beta, monitoring, gradual rollout, legacy code removal (Phases A-D), rename `mobile-v3` → `mobile`, repository config rewrite, documentation rewrite.
- **[Meta: Parallelization & Risks](./plan-meta.md)** — Parallelization opportunities and risk mitigation.

---

## Current Status (2026-05-11)

### Completed
- P0: Foundation — packages scaffolded, Drizzle schema, Zod schemas, CI workflows
- P1: API Core — auth middleware, CRUD routes, rate limiting (**8 stubs remain**)
- P2: Mobile Shell — auth, navigation, design system, API client
- P3: Feature Build — all screens built (**camera + voice pipelines not wired**)

### In Progress / Remaining

| Work Item | Phase | Estimated |
|-----------|-------|-----------|
| Implement 8 stubbed API routes (generate, PDF, presign, file URL, transcribe, summarize, AI settings read/write) | P1 | 3-4 days |
| Generate OpenAPI types (`api-contract/src/generated/`) | P0 | 2h |
| Wire voice note pipeline (record → upload → transcribe → summarize) | P3 | 14h |
| Wire camera pipeline (capture → upload queue → timeline) | P3 | 13h |
| Upload tray badge (currently no-op) | P3 | 2h |
| Port remaining 13 Maestro flows (36/49 done) | P4 | 8h |
| UI/styling parity with mobile-old | P4 | 27h |
| Bug fixing + performance optimization | P4 | 22h |
| P4.5 exit gate (all Maestro green, 80% coverage, build clean) | P4 | — |
| Test infrastructure (Testcontainers, MSW, mock AI, ~217 tests) | P5 | 2 weeks |
| Fly.io deploy, EAS builds, monitoring, rollout | P6 | 1 week |
| Legacy code removal (Phases A-D) | P6 | 1 week |
| Rename `mobile-v3` → `mobile` + repo config rewrite | P6 | 8h |
| Documentation rewrite | P6 | 19h |

### Known Loose Ends

| Issue | Severity | Action |
|-------|----------|--------|
| EAS `projectId` is `"placeholder-will-be-set-later"` in `app.json` | Blocking (builds) | Set real project ID before any EAS build |
| `EXPO_PUBLIC_API_URL` undocumented for local dev | Blocking (runtime) | Add `.env.example` or document in README |
| Maestro `appId` in some flows is `com.harpa.pro` (v1 bundle ID), should be `com.harpa.pro.v3` | Blocking (E2E) | Update all `.maestro/` flows |
| `Alert.alert` used in 3 places (camera, FilePicker) — violates AGENTS.md | Convention | Replace with `AppDialogSheet` |
| `react-dom` in dependencies (should be devDependencies) | Cleanup | Move to devDependencies |
| `react-native-worklets` possibly unused | Cleanup | Verify imports, remove if unused |
| App slug `harpa-pro-v3` / bundle ID `com.harpa.pro.v3` — separate app vs takeover? | Decision needed | Decide before P6 |
| `arch-migration.md` docs diverge from actual `eas.json` config | Docs | Update arch doc |
| No Fly.io `Dockerfile` / `fly.toml` yet | Expected | Create in P6 |
| Old `apps/mobile/` path referenced in Maestro subflow comment | Cleanup | Remove stale comment |

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Source files (excl. tests) | < 150 (vs 246 in v1) | `find apps/mobile-v3/src packages/api/src -name '*.ts' -o -name '*.tsx' \| grep -v __tests__ \| wc -l` |
| Test coverage | ≥ 80% | `pnpm test -- --coverage` |
| Maestro flows passing | 49/49 | `maestro test apps/mobile-v3/.maestro/` |
| API latency p95 | < 200ms | Fly.io metrics dashboard post-deploy |
| Mobile cold start | < 2s | Maestro `assertVisible` timing on first screen |
| Bundle size | ≤ v1 baseline | Compare EAS build artifacts (measure v1 baseline first) |
| v1 bundle size baseline | **Not yet measured** | `du -h` on current EAS build — do this before P6 |

---

## Recommended Execution Order

```
1. Implement 8 API stubs              ← unblocks everything downstream
2. Generate OpenAPI types              ← typed mobile client
3. Wire voice note pipeline            ← top user-facing priority
   (record → upload → transcribe → summarize)
4. Wire camera pipeline                ← second user-facing priority
   (capture → upload queue → timeline)
5. Upload tray badge wiring            ← supports both pipelines
6. Port remaining 13 Maestro flows     ← E2E confidence
7. UI/styling parity (P4.2)            ← visual polish
8. Bug fixing (P4.3)                   ← stabilize
9. Performance optimization (P4.4)     ← final polish
10. P4.5 exit gate                     ← hard gate
11. Test infrastructure + tests (P5)   ← integration/component coverage
12. Deploy API + mobile beta (P6.1-2)  ← ship it
13. Monitoring + gradual rollout (P6.3)← prove it works
14. Legacy code removal (P6.4)         ← clean up old code
15. Rename mobile-v3 → mobile (P6.5)   ← canonical paths
16. Repo config rewrite (P6.6)         ← clean dotfiles, scripts, CI
17. Documentation rewrite (P6.7)       ← accurate docs for current state
```

---

*End of implementation plan.*
