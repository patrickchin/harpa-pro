# 2026-05-22 — `pickStorage()` read `process.env.R2_FIXTURE_MODE` directly while every other line in the module read `env.R2_*` (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** None in production — caught proactively during the
P3.15 camera-upload audit. The bug would have surfaced as a silent
disagreement: any test or process that mutated `process.env.R2_FIXTURE_MODE`
after `env.ts` parsed (e.g. a test that toggles `live` mid-suite, or
a future ESM bundler tree-shaking decision that froze `env` earlier)
would have made `pickStorage()` return one storage flavour while
`R2Storage`'s constructor read its bucket/credentials from the
Zod-parsed `env` const — i.e. live R2 selection with replay-mode
config (or vice-versa).

**Root cause.** Layer-1 trapdoor. `env.ts` exists precisely so
that the parsed view is the single source of truth, but a single
`process.env.R2_FIXTURE_MODE` slipped past review and made the
default factory's decision diverge from the consumers' decision.
Compounded by the absence of any default-wiring integration test
for the live R2 path (everything ran against the in-memory replay
backend, masking the trapdoor — classic R5 / Pitfall 13).

**Fix.** Two commits:

- `refactor(api): pickStorage reads parsed env (Pitfall 13 trapdoor)`
  — `pickStorage()` now branches on `env.R2_FIXTURE_MODE`.
- `test(api): exercise R2Storage default-wiring against MinIO`
  (`files.r2-live.integration.test.ts`) — boots a MinIO container
  via Testcontainers, sets the env, reloads the modules, calls the
  real `/files/presign` route and asserts the SigV4 PUT against
  MinIO returns 200. No DI stubs.

**Test.**
1. `scripts/check-no-process-env-r2.sh` greps `packages/` + `apps/`
   for raw `process.env.R2_*` outside `packages/api/src/env.ts` and
   test files. Reverting the `pickStorage()` change turns the lint
   red.
2. `files.r2-live.integration.test.ts` is the default-wiring
   integration test that exercises the live storage flavour against
   MinIO — green when both layers (the factory selector and the
   client constructor) read the same view of the world.

**Pattern.** R5 — DI stubs become the spec; default wiring silently
broken. Mitigation is the same two-layer fix every R5 fix uses:
(a) make the wrong reach impossible (lint guard); (b) cover the
real default factory with an integration test that uses no stubs.
