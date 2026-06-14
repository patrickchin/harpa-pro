# Onboarding POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a morning-testable mobile POC that lets us compare three onboarding optimizations: first real report, polished sample report, and project workspace setup.

**Architecture:** Add an authenticated `/(app)/onboarding-lab` route that renders a props-only screen body. The screen is local-only UI: it does not create data until the user taps an existing real CTA such as “Create project.” Entry points live in the empty Projects state and the Developer screen.

**Tech Stack:** Expo Router, React Native, NativeWind v4, existing primitives (`SafeAreaView`, `ScreenHeader`, `Card`, `Button`), Vitest + react-test-renderer.

---

### Task 1: Data And Screen Contract

**Files:**
- Create: `apps/mobile/lib/onboarding/poc.ts`
- Create: `apps/mobile/screens/onboarding-lab.tsx`
- Test: `apps/mobile/screens/onboarding-lab.test.tsx`

- [x] Write a failing screen test that asserts the lab renders three options: `Report first`, `Sample report`, and `Workspace setup`.
- [x] Write a failing screen test that changes the selected option and verifies `onSelectVariant` receives the selected id.
- [x] Implement `ONBOARDING_POC_VARIANTS` with stable ids: `report-first`, `sample-report`, `workspace-first`.
- [x] Implement `OnboardingLab` as a props-only screen with no network calls.

### Task 2: Route And Entry Points

**Files:**
- Create: `apps/mobile/app/(app)/onboarding-lab.tsx`
- Modify: `apps/mobile/app/(app)/_layout.tsx`
- Modify: `apps/mobile/app/(app)/projects/index.tsx`
- Modify: `apps/mobile/screens/projects-list.tsx`
- Modify: `apps/mobile/app/(app)/developer.tsx`
- Modify: `apps/mobile/screens/developer.tsx`
- Test: `apps/mobile/screens/developer.test.tsx`

- [x] Add a route wrapper that owns selected variant state and routes primary actions to `/(app)/projects/new`.
- [x] Register `onboarding-lab` in the app stack.
- [x] Add an optional empty-state CTA from Projects to the lab.
- [x] Add a Developer screen row so existing accounts can open the lab.
- [x] Add a Developer screen test for the new row.

### Task 3: Verification

**Commands:**
- `pnpm --filter @harpa/mobile test:nocoverage -- screens/onboarding-lab.test.tsx screens/developer.test.tsx`
- `pnpm --filter @harpa/mobile typecheck`
- `git diff --check`

If local dependencies are unavailable, record the exact failure and rely on CI or a local install later.

**Status:** Implemented. `git diff --check` passed. Local Vitest and typecheck are blocked because this worktree is missing installed `node_modules` packages.
