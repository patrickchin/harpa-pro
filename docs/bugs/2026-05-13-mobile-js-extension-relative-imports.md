# 2026-05-13 — `.js` extensions reappeared in mobile relative imports (Pattern R2)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** `pnpm --filter @harpa/mobile ios` fails Metro bundling
with `Unable to resolve "./session.js" from "apps/mobile/lib/auth/index.ts"`
during P3.0 dev-gallery launch. Vitest stayed green; problem only
visible when the simulator actually tried to load the bundle.

**Root cause.** Same as commit `0036006`: mobile relative TS imports
written as `./foo.js` (TS-recommended ESM shape, fine for Node /
the API package, broken under Metro). Two re-introduction sources:
(1) new auth/api modules added in P2.4–P2.7 mirroring the API
style, and (2) the `apps/mobile/scripts/gen-hooks.ts` template
emitting `from './client.js'` etc. into the regenerated
`lib/api/hooks.ts`.

**Fix.** Stripped `.js` from every relative import under
`apps/mobile/**/*.{ts,tsx}` (24 sites across `lib/api/*`,
`lib/auth/*`, `screens/dev-gallery.test.ts`), and updated the
generator template in `scripts/gen-hooks.ts` so future regens
don't bring it back. Catalogued as Pattern R2 above.

**Test.** Manual: rerun `pnpm --filter @harpa/mobile ios` and
confirm bundling succeeds. (No automated guard yet — a CI grep
gate `apps/mobile/**/*.{ts,tsx}` for
`from '\\./[^']+\\.js'` would have caught it; deferred to P4
infra hardening with a carve-out note.)

**Pattern.** R2 (new — added to README).
