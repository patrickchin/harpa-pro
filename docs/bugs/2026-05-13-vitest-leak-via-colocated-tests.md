# 2026-05-13 — Vitest leaked into mobile bundle via colocated `*.test.tsx` (Pattern R4)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Right after landing the R3 regression test inside
`apps/mobile/app/(app)/_layout.test.tsx`, the iOS bundle errored at
runtime with
`Unable to resolve "@vitest/runner/utils" from node_modules/vitest/dist/index.js`
on every screen mount. Vitest itself ran the file fine; only the
Metro bundle was affected.

**Root cause.** `expo-router` auto-discovers routes by globbing
`app/**/*.{ts,tsx}` via `require.context`. The test file matched
that glob, was pulled into the Metro graph at app boot, and
transitively dragged in `vitest` → `@vitest/runner/utils` →
`chai`, none of which Metro can resolve.

**Fix.** Moved the test to
`apps/mobile/__tests__/layouts/app-layout.test.tsx` (outside the
routed `app/` tree, mirroring the route path so it stays
discoverable). Also renamed `apps/mobile/app/(dev)/registry.ts`
→ `_registry.ts` — same root cause for the long-standing
"Route registry.ts is missing the required default export"
warning, since route-scanner conventions skip files prefixed with
`_`.

**Test.** Pattern-level guard, not a single test: the iOS bundle
smoke-test added to `docs/v4/overnight-protocol.md` §5 (now run
after every commit) catches this regression. Run locally with
`pnpm --filter @harpa/mobile bundle:smoke` (added in the same
commit).

**Pattern.** R4 (new — added to README).
