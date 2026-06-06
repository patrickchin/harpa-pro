# 2026-06-06 — `routes/dev.ts` boot crash on `harpa-pro-api-dev`

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Every push to `dev` from 2026-06-05 22:01Z onwards failed
the `Verify /readyz (dev)` step in `api-dev.yml`. After the readyz fix
in [`2026-06-06-api-dev-readyz-cold-start.md`](2026-06-06-api-dev-readyz-cold-start.md)
landed and bumped the timeout to 6×30s = 3 minutes, the same dev pushes
*still* failed at the same step — but now the `Diagnose readyz failure`
step printed the actual cause from `flyctl logs`:

```
2026-06-06T09:04:08Z app[287e647a166d68] fra [info]/app/packages/api/src/routes/dev.ts:36
  throw new Error('routes/dev.ts must not be loaded in real production');
        ^
Error: routes/dev.ts must not be loaded in real production
    at <anonymous> (/app/packages/api/src/routes/dev.ts:36:9)
```

The Fly machine started, the Node process crashed at module-load, the
machine never bound to port 8787, and `/readyz` hit a TCP-accept-but-
never-respond zombie listener (so curl exhausted its full
`--max-time 30` six times). Earlier dev pushes had been failing the
same way; the previous 5×5s readyz loop just gave up before the
crash made it through Fly's log buffer to the runner.

**Root cause — Pattern: top-level side effect in a statically imported
module.** `packages/api/src/app.ts` line 24:

```ts
import { devRoutes } from './routes/dev.js';
```

ESM evaluates a statically-imported module's body unconditionally
when the importer is loaded — there is no way for the conditional
mount block at line 119–124 of `app.ts` to "skip" the import. Inside
`routes/dev.ts` the module body had:

```ts
if (env.NODE_ENV === 'production' && env.HARPAPRO_PR_BUILD !== '1') {
  throw new Error('routes/dev.ts must not be loaded in real production');
}
```

`infra/fly/fly.dev.toml` sets `NODE_ENV = "production"` and *never*
sets `HARPAPRO_PR_BUILD`. Only `infra/fly/fly.preview.toml` sets
`HARPAPRO_PR_BUILD = "1"`. So on dev:

1. Fly boots the machine, `tsx src/server.ts` runs,
2. Node loads `app.ts`, which static-imports `routes/dev.js`,
3. `dev.ts` body evaluates → throws → process exits 1,
4. Fly retries the launch a few times, then leaves the machine in
   `started` state with no listener (this is the real puzzle —
   `flyctl status` reported `started` even though the process was
   dead, because Firecracker's init kept running while Node exited).

The dev.ts docstring listed the throw as "Layered control 1: Module
throw at import when NODE_ENV=production && !PR_BUILD" but that
defense was incompatible with `app.ts` doing a top-level static
import — the throw fires *before* any mount gate has a say. The
file's design assumed a dynamic importer; nothing in the codebase
ever made it dynamic.

The bug had been latent since 2026-06-02 (commit `33d6b38f` —
"feat(api): rip-and-replace better-auth migration") which added both
the static import in `app.ts` and the new `dev.ts` module with the
throw. It was masked for ~3 days by a combination of (a) the prior
readyz timeout being short enough to declare "the runner gave up,
not the deploy" rather than surface the boot crash, and (b) post-
merge-only triggering of `api-dev.yml` (no PR signal).

**Fix.** [`fix(api): drop module-level throw in routes/dev.ts`] — remove
the top-level `throw` in `packages/api/src/routes/dev.ts`. Defense in
depth is preserved by the other layers, all of which run at boot or
per-request:

1. **env.ts refines** (already there): `DEV_OTP_TOKEN must be unset`
   on real production (`NODE_ENV=production && !HARPAPRO_PR_BUILD`),
   `DEV_OTP_TOKEN must be set` in dev/PR-preview unless
   `HARPA_DEV_OTP_DISABLED=1`. Both fail at `Env.parse()` → boot
   crash with a clear Zod error.
2. **App.ts mount gate** (already there): the route is mounted only
   when `(NODE_ENV !== 'production' || HARPAPRO_PR_BUILD === '1') &&
   !!DEV_OTP_TOKEN`. On real production both halves are false, so
   the route is unreachable.
3. **Per-request shared-secret header** with `timingSafeEqual`.
4. **Email allowlist regex** — `*@e2e.harpapro.com`.
5. **Exact identifier SQL** — no `LIKE` wildcard.
6. **Per-IP global rate limit.**
7. **Audit log every call.**

**Test added.** `packages/api/src/__tests__/app.boot.test.ts`:

- imports `app.ts` and `routes/dev.ts` under the dev-Fly env shape
  (`NODE_ENV=production`, `HARPAPRO_PR_BUILD` unset, no
  `DEV_OTP_TOKEN`, `HARPA_DEV_OTP_DISABLED=1`) and asserts neither
  throws.
- imports `app.ts` under the PR-preview env shape
  (`NODE_ENV=production`, `HARPAPRO_PR_BUILD=1`, `DEV_OTP_TOKEN`
  set) and asserts no throw.

Confirmed the test fails on the unfixed code and passes on the fix
(`pnpm --filter @harpa/api exec vitest run src/__tests__/app.boot.test.ts`).

**Why CI didn't catch it.**

- `api-dev.yml` only triggers on push to `dev`, so the deploy + boot
  path runs post-merge. PR-preview tested the *same code* against
  `fly.preview.toml` which DOES set `HARPAPRO_PR_BUILD=1`, masking
  the bug.
- `dev.integration.test.ts` exists but runs the route handlers in a
  test process that sets `NODE_ENV=test`, so the throw guard never
  fired in test — the regression existed *only* when both
  `NODE_ENV=production` AND `HARPAPRO_PR_BUILD!=1` AND the module
  was actually loaded (which only happens via `app.ts`'s static
  import in a real deploy).
- The trigger-matrix doc added in the same week
  ([`docs/v4/arch-cicd-and-migrations.md`](../v4/arch-cicd-and-migrations.md)
  §"Workflow trigger matrix") explicitly flags `api-dev.yml` as a
  post-merge-only blind spot. The new `app.boot.test.ts` runs in
  PR-gated `api-integration` so this specific class of regression
  (top-level side effect in a statically-imported module) is now
  caught at PR time.

**Recurrence guard.** Any module imported by `app.ts` must not have
top-level side effects that depend on runtime env shape. If a module
needs to "fail fast on misconfig", express that as either:

- an env.ts Zod refinement (preferred — catches at parse), or
- a function called from `createApp()` after the env is known to be
  valid (so the throw is reachable on the same code path that does
  the mount), or
- a per-request middleware check that returns the public 404.

A top-level `throw` is *only* safe if the module is loaded by a
dynamic `await import()` inside a guard that already evaluated the
same condition.
