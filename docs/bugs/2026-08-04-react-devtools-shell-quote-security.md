# 2026-08-04 — React DevTools pinned vulnerable shell-quote

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** `pnpm audit` reported both critical command injection
([GHSA-w7jw-789q-3m8p](https://github.com/advisories/GHSA-w7jw-789q-3m8p))
and high-severity denial of service
([GHSA-395f-4hp3-45gv](https://github.com/advisories/GHSA-395f-4hp3-45gv))
through `shell-quote@1.8.3` in the mobile development toolchain.

**Root cause.** `react-native@0.83.6` depends on
`react-devtools-core@6.1.5`, which allows `shell-quote@^1.6.1`. The frozen
lockfile retained vulnerable `1.8.3` after patched releases became available.
The first advisory is fixed in `1.8.4`, but that release remains affected by
the second advisory; all known advisories require at least `1.9.0`.

**Fix.** Add a parent-scoped pnpm override for
`react-devtools-core>shell-quote` to `1.10.0`, the current patched 1.x release,
and refresh only that lockfile edge. This avoids changing React Native or any
native dependency.

**Test.** `scripts/ci/__tests__/shell-quote-security-policy.test.cjs` asserts
the exact parent-scoped override, rejects any other `shell-quote` resolution in
the lockfile, and verifies `react-devtools-core` resolves the patched version.
The credential-free `lint-typecheck` workflow runs the policy on every relevant
pull request.

**Pattern.** A frozen lockfile can strand a security patch even when the
parent's transitive range permits it. Use the narrowest parent-child override
that clears all current advisories, pin its resolved graph in CI, and remove it
when the parent declares the secure floor.
