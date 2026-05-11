# P6: Migration (Week 10-11)

> Part of [Implementation Plan](./implementation-plan.md)

### Prerequisites

**P4.5 Exit Gate must pass before starting any P6 work.** See
[`plan-p4-e2e-polish.md` § P4.5](./plan-p4-e2e-polish.md#p45--p4-exit-gate-must-pass-before-starting-p5)
for the full checklist. In summary:

- All 49 Maestro flows passing
- Unit test coverage ≥ 80%
- `pnpm build && pnpm -r typecheck && pnpm test` all green
- Side-by-side visual parity approved

### Goal
Beta rollout with feature flag.

### P6.1 — Deploy API

**Deliverables:**
- API deployed to Fly.io

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P6.1.1 | Create Fly.io app | 1h | P4 |
| P6.1.2 | Configure secrets | 1h | P6.1.1 |
| P6.1.3 | Deploy staging | 2h | P6.1.2 |
| P6.1.4 | Smoke test staging | 2h | P6.1.3 |
| P6.1.5 | Deploy production | 1h | P6.1.4 |

**Acceptance Criteria:**
- [ ] API running on api.harpa.app
- [ ] All endpoints responding
- [ ] Monitoring in place

---

### P6.2 — Mobile Beta

**Deliverables:**
- mobile-v3 in TestFlight/Play Store Internal

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P6.2.1 | Configure EAS for mobile-v3 | 2h | P6.1 |
| P6.2.2 | Build preview | 2h | P6.2.1 |
| P6.2.3 | Internal testing | 4h | P6.2.2 |
| P6.2.4 | Fix critical issues | 4h | P6.2.3 |
| P6.2.5 | Build production | 2h | P6.2.4 |
| P6.2.6 | Submit to stores | 2h | P6.2.5 |

**Acceptance Criteria:**
- [ ] App in TestFlight
- [ ] App in Play Store Internal
- [ ] Feature flag controls rollout

---

### P6.3 — Monitoring & Rollout

**Deliverables:**
- Monitoring, gradual rollout

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P6.3.1 | Set up error tracking (Sentry) | 2h | P6.2 |
| P6.3.2 | Set up API metrics | 2h | P6.3.1 |
| P6.3.3 | Enable for 10% users | 1h | P6.3.2 |
| P6.3.4 | Monitor for 48h | — | P6.3.3 |
| P6.3.5 | Expand to 50% | 1h | P6.3.4 |
| P6.3.6 | Monitor for 48h | — | P6.3.5 |
| P6.3.7 | Full rollout | 1h | P6.3.6 |

**Acceptance Criteria:**
- [ ] Error rate < 0.1%
- [ ] p95 latency < 500ms
- [ ] 100% users on v3

---

### P6.4 — Legacy Code Removal

Remove old code incrementally as v3 replacements are verified. Each removal
requires its gate tests to pass (see `plan-p5-testing.md` Part 4).

#### Phase A: Remove Now (no v3 dependency)

These have no working code behind them and can be deleted immediately.

| Task | What | Rationale |
|------|------|-----------|
| P6.4.A1 | `.github/workflows/mobile-tests.yml` | References deleted `apps/mobile/` path -- broken |
| P6.4.A2 | `.github/workflows/maestro-smoke.yml` | References deleted `apps/mobile/.maestro/` -- broken |
| P6.4.A3 | `.github/workflows/eas-update.yml` | References deleted `apps/mobile`, chains off broken workflow |
| P6.4.A4 | `supabase/functions/generate-report-playground/` | No v3 equivalent, not used by mobile app |
| P6.4.A5 | `supabase/functions/backfill-file-thumbnails/` | One-off admin utility, no longer needed |
| P6.4.A6 | Remove `@harpa/report-core` from `mobile-v3/package.json` | Listed as dependency but zero imports in v3 |
| P6.4.A7 | Remove `@harpa/report-core` from `packages/api/package.json` | Listed as dependency but zero imports in v3 |

#### Phase B: Remove After API Stubs Implemented

Each edge function can be deleted once its v3 API route passes integration
tests with both fixture mode and real provider mode. The v3 route must
satisfy the same acceptance criteria as the original edge function.

| Task | What | Gate |
|------|------|------|
| P6.4.B1 | `supabase/functions/generate-report/` | `POST /reports/:id/generate` integration tests pass (fixture + real provider) |
| P6.4.B2 | `supabase/functions/transcribe-audio/` | `POST /files/:fileId/transcribe` integration tests pass |
| P6.4.B3 | `supabase/functions/summarize-voice-note/` | `POST /files/:fileId/summarize` integration tests pass |
| P6.4.B4 | `supabase/functions/_shared/` | All of B1-B3 complete (shared code is imported by all three) |
| P6.4.B5 | `.github/workflows/generate-report.yml` | B1 complete |
| P6.4.B6 | `.github/workflows/capture-fixtures.yml` | B1 complete |

#### Phase C: Remove After v3 Launch (100% rollout)

| Task | What | Gate |
|------|------|------|
| P6.4.C1 | `apps/mobile-old/` | v3 at 100% rollout, no rollback needed |
| P6.4.C2 | `packages/report-core/` | C1 complete (only consumer is mobile-old) |
| P6.4.C3 | Old Maestro flows in `apps/mobile-old/.maestro/` | Removed with C1 |
| P6.4.C4 | Old unit tests in `apps/mobile-old/__tests__/` | Removed with C1 |
| P6.4.C5 | Stale `.gitignore` entries for `apps/mobile/` | Clean up after C1 |
| P6.4.C6 | Root `pnpm-workspace.yaml` entries for removed packages | Clean up after C1+C2 |

#### Phase D: Post-Removal Cleanup

| Task | What |
|------|------|
| P6.4.D1 | Remove `supabase/functions/` directory if empty |
| P6.4.D2 | Update `docs/02-deployment.md` to remove edge function references |
| P6.4.D3 | Update `AGENTS.md` to remove edge function test commands |
| P6.4.D4 | Update `docs/v3/arch-migration.md` to mark report-core as removed |
| P6.4.D5 | Run `pnpm install` and verify no broken workspace references |
| P6.4.D6 | Verify CI: all workflows green with no orphan triggers |

**Acceptance Criteria:**
- [ ] No dead code referencing deleted paths
- [ ] No broken CI workflows
- [ ] No orphan dependencies in any `package.json`
- [ ] `pnpm install && pnpm test && pnpm build` succeeds from clean state
- [ ] `docs/` updated to reflect current architecture

---

### P6.5 — Rename `mobile-v3` → `mobile`

After v3 is at 100% rollout and `apps/mobile-old` is removed, rename the
v3 app to take over the canonical path. This is a single coordinated commit
that touches many files.

**Tasks:**

| Task | Description | Est. |
|------|-------------|------|
| P6.5.1 | Rename `apps/mobile-v3/` → `apps/mobile/` | 30m |
| P6.5.2 | Update `app.json`: slug `harpa-pro-v3` → `harpa-pro`, bundle ID `com.harpa.pro.v3` → `com.harpa.pro` | 30m |
| P6.5.3 | Update `eas.json`: channels `*-v3` → remove `-v3` suffix | 15m |
| P6.5.4 | Update root `package.json`: rename all `--filter mobile-v3` to `--filter mobile`, remove `*-old*`/`*:v1` scripts | 30m |
| P6.5.5 | Update `.github/workflows/mobile-v3-tests.yml` → rename to `mobile-tests.yml`, fix paths | 30m |
| P6.5.6 | Update `.gitignore`, `.easignore`, `.vercelignore` to use `apps/mobile/` | 15m |
| P6.5.7 | Update `AGENTS.md` path references | 15m |
| P6.5.8 | Run `pnpm install && pnpm build && pnpm test` to verify nothing broke | 30m |

**Acceptance Criteria:**
- [ ] No reference to `mobile-v3` anywhere in the repo (grep clean)
- [ ] No reference to `mobile-old` anywhere in the repo
- [ ] CI green
- [ ] EAS builds succeed under new slug

---

### P6.6 — Repository Config Rewrite

Rewrite all root-level config, scripts, CI workflows, and dotfiles from
scratch to match the post-migration monorepo structure. Goal: every config
file should reflect the current state, not carry v1 archaeology.

#### P6.6.1 — Root Files

| File | Action | Details |
|------|--------|---------|
| `package.json` | REWRITE | Clean scripts: `dev`, `build`, `test`, `typecheck`, `lint`, `ios`, `ios:mock`, `ios:mock:release`. Remove all `*-old*`, `*:v1`, `dev:mobile-old`, `test:mobile-old`, `build:mobile-old:*` scripts. |
| `README.md` | REWRITE | Project overview, monorepo structure, getting started, env setup, test commands, CI badges. Reference `apps/mobile`, `packages/api`, `packages/api-contract`. |
| `AGENTS.md` | REWRITE | Update stack description, test commands, workspace paths. Reference v3 architecture. |
| `TODO.md` | REWRITE | Audit all items for v3 relevance, remove v1-only items. |
| `.gitignore` | UPDATE | Consolidate to single `apps/mobile/android/`, `apps/mobile/ios/`. Remove stale `apps/mobile-v3/`, `apps/playground/` entries. |
| `.easignore` | UPDATE | Fix paths and comments. |
| `.vercelignore` | UPDATE | Remove `apps/playground` reference. Fix mobile path. |
| `app.config.js` | UPDATE | Fix error message path. |
| `tsconfig.json` | REVIEW | Verify extends chain works after rename. |
| `.hermes/plans/` | REMOVE | Stale planning artifacts. |

#### P6.6.2 — Scripts

| File | Action | Details |
|------|--------|---------|
| `scripts/sync-eas.sh` | REWRITE | Update `apps/mobile` path, remove v1 references. |
| `scripts/sync-eas.ps1` | REWRITE | Same as above (Windows). |
| `scripts/test-rls-local.sh` | UPDATE | Change `--filter mobile-old` to `--filter mobile`. |
| `scripts/test-e2e-local.sh` | UPDATE | Change Maestro path to `apps/mobile/.maestro/`. |
| `scripts/install-git-hooks.sh` | KEEP | Path-agnostic. |
| `scripts/seed_production.py` | KEEP | Path-agnostic. |

#### P6.6.3 — CI Workflows

| File | Action | Details |
|------|--------|---------|
| `.github/workflows/ci.yml` | UPDATE | Change `working-directory: apps/mobile` to correct path. Remove `apps/playground` job. |
| `.github/workflows/mobile-tests.yml` | REMOVE | Replaced by renamed `mobile-v3-tests.yml`. |
| `.github/workflows/mobile-v3-tests.yml` | RENAME → `mobile-tests.yml` | Update trigger paths from `apps/mobile-v3/**` to `apps/mobile/**`. |
| `.github/workflows/maestro-smoke.yml` | REWRITE | Update all paths to `apps/mobile/.maestro/`, fix `working-directory`. |
| `.github/workflows/eas-update.yml` | REWRITE | Update `WORKING_DIR`, fix workflow chain reference. |
| `.github/workflows/rls-tests.yml` | REVIEW | Check for `mobile-old` filter references. |
| `.github/workflows/sync-eas.yml` | REVIEW | Check for `apps/mobile` path references. |
| `.github/agents/*.agent.md` | REVIEW | Update any `apps/mobile` path references. |

#### P6.6.4 — Supabase Cleanup

| Item | Action | Details |
|------|--------|---------|
| `supabase/snippets/` | REMOVE | Empty directory. |
| `supabase/functions/generate-report-playground/` | REMOVE | No v3 consumer (already in Phase A). |
| `supabase/functions/backfill-file-thumbnails/` | REMOVE | One-off utility (already in Phase A). |
| `supabase/tests/README.md` | UPDATE | Fix any `apps/mobile` or filter references. |

**Acceptance Criteria:**
- [ ] `grep -r 'apps/mobile-old\|apps/mobile-v3\|apps/playground\|mobile-old' . --include='*.{json,yaml,yml,md,sh,ps1,ts,js}' -l` returns 0 results (excluding `docs/v3/` planning docs and archived retrospectives)
- [ ] All scripts in `scripts/` run successfully
- [ ] All CI workflows reference correct paths
- [ ] No empty directories remain
- [ ] `pnpm install && pnpm build && pnpm test` succeeds from clean state

**Estimated total: ~8h**

---

### P6.7 — Documentation Rewrite

Rewrite project documentation to reflect the v3 architecture. Archive
historical docs that are no longer actionable.

#### Documentation Structure (target)

```
docs/
├── 01-architecture.md          ← REWRITE: v3 monorepo structure, packages, data flow
├── 02-deployment.md            ← REWRITE: Fly.io API + EAS mobile, remove edge function refs
├── 03-ai-providers.md          ← UPDATE: verify still accurate, add REST API routing
├── 04-report-schema.md         ← KEEP: schema reference (still valid)
├── 06-pricing.md               ← KEEP: business doc, path-agnostic
├── 07-merge-workflow.md        ← KEEP: process doc, path-agnostic
├── 08-secrets-management.md    ← UPDATE: fix script paths, add Fly.io secrets
├── 09-testing.md               ← REWRITE: v3 test strategy (Vitest, Maestro, Testcontainers)
├── 10-media-pipeline.md        ← REWRITE: v3 upload queue, camera, voice pipeline
├── bugs/
│   └── README.md               ← UPDATE: verify paths, keep patterns (R1-R11)
├── maestro/
│   ├── test-plan.md            ← REWRITE: v3 Maestro flows, paths, fixture mode
│   ├── login-troubleshooting.md ← REWRITE: v3 auth flow debugging
│   └── coverage-gaps.md        ← UPDATE: v3 flow inventory
├── features/
│   ├── 01-payment-system-design.md  ← UPDATE: fix path refs
│   ├── 02-feature-flags.md          ← UPDATE: fix path refs
│   ├── 03-soc2-compliance-gap-analysis.md ← UPDATE: fix path refs
│   ├── 06-maestro-coverage-gap.md   ← UPDATE: v3 Maestro paths
│   └── report-comments.md          ← UPDATE: fix path refs
├── archive/                    ← NEW: move historical docs here
│   ├── local-first-offline/    ← MOVE from features/
│   ├── rest-api-migration/     ← MOVE from features/ (completed)
│   ├── handoff-overnight-2026-05-09.md ← MOVE
│   └── retrospectives/        ← MOVE from docs/retrospectives/
├── investor/                   ← KEEP: path-agnostic
│   ├── pitch-deck-v2.md
│   ├── build_deck.py
│   └── Harpa-Pro-Deck-v2.pptx
└── v3/                         ← KEEP during migration, ARCHIVE after launch
    ├── architecture.md
    ├── arch-*.md
    ├── plan-*.md
    └── implementation-plan.md
```

#### Tasks

| Task | Description | Est. |
|------|-------------|------|
| P6.7.1 | Create `docs/archive/` and move historical docs (local-first-offline, rest-api-migration, handoff, retrospectives) | 1h |
| P6.7.2 | REWRITE `docs/01-architecture.md` — v3 monorepo: `apps/mobile`, `packages/api`, `packages/api-contract`, Supabase DB, Fly.io hosting | 2h |
| P6.7.3 | REWRITE `docs/02-deployment.md` — Fly.io API deploy, EAS mobile builds, remove all edge function deploy steps | 2h |
| P6.7.4 | REWRITE `docs/09-testing.md` — Vitest unit tests, Testcontainers integration, MSW component tests, Maestro E2E, coverage targets | 2h |
| P6.7.5 | REWRITE `docs/10-media-pipeline.md` — v3 upload queue, camera pipeline, voice note pipeline, presigned URLs | 2h |
| P6.7.6 | REWRITE `docs/maestro/test-plan.md` + `login-troubleshooting.md` — v3 Maestro paths, v3 auth flow | 2h |
| P6.7.7 | UPDATE `docs/03-ai-providers.md` — add REST API routing, verify provider list | 1h |
| P6.7.8 | UPDATE `docs/08-secrets-management.md` — fix script paths, add Fly.io secrets | 1h |
| P6.7.9 | UPDATE remaining feature docs (payment, feature-flags, soc2, maestro-coverage, report-comments) — fix `apps/mobile` refs | 2h |
| P6.7.10 | UPDATE `docs/bugs/README.md` — verify paths, add any new v3 patterns | 1h |
| P6.7.11 | REWRITE `README.md` — project overview, structure, getting started, env setup, commands | 2h |
| P6.7.12 | Verify: no doc outside `docs/archive/` and `docs/v3/` references `apps/mobile-old`, `apps/mobile-v3`, or `apps/playground` | 1h |

**Acceptance Criteria:**
- [ ] Every doc reflects the current v3 architecture
- [ ] No stale path references in active docs
- [ ] Historical docs archived, not deleted
- [ ] README is accurate and useful for new contributors
- [ ] `docs/v3/` planning docs kept as migration reference (archive after launch)

**Estimated total: ~19h**
