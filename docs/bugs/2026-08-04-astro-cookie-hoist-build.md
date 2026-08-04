# 2026-08-04 — Astro prerender resolves hoisted CommonJS cookie (Pattern R16)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** After upgrading both static web workspaces to Astro 7, `astro
build` bundled the entrypoints but failed before prerendering with `Named export
'parseCookie' not found`. The module runner had loaded the hoisted CommonJS
`cookie@0.7.2` instead of Astro's ESM `cookie@2.0.1` dependency.

**Root cause.** The repository uses pnpm's hoisted node linker for Expo. Other
root tools also depend on older `cookie` releases, so the hoister selected a
CommonJS version at the workspace root. Astro 7's Vite 8 prerender path resolved
that public copy even though Astro had its correct ESM release nested beneath
its own package.

**Fix.** Declare exact `cookie@2.0.1` dev dependencies in `apps/site` and
`apps/admin`, making the ESM build-time implementation part of each workspace's
explicit graph without forcing unrelated consumers onto a new major.

**Test.** Both workspace smoke suites assert the direct version, then their
normal static-build gates exercise Astro's complete prerender path.

**Pattern.** R16 — workspace manifests disagree with the resolved peer graph.
