# 2026-06-06 — `scripts/journeys/*.sh` sign-in always 401s on dev because test accounts were never seeded

## Smell

Three consecutive post-deploy runs of the journey suite (`27059062583`,
`27059317814`, `27059774601`) failed with the cryptic
`✗ no set-auth-token header on sign-in (rc=1)` after PRs #148–#150 had
already aligned the journey scripts to better-auth's actual response
shapes. Stress section D failed with 429s (better-auth's per-IP
auth-route rate limiter), but core and extended kept failing with
non-429, non-200 — meaning sign-in was getting a **plain 401** even
with the correct `TEST_ACCOUNT_PASSWORD` from the GH secret.

A live probe of `harpa-pro-api-dev.fly.dev` showed:

```sh
$ curl -X POST .../api/auth/sign-in/email \
    -d '{"email":"alice@e2e.harpapro.com","password":"WRONG"}'
{"message":"Invalid credentials"}     # 401
```

— exactly the response we'd expect for **wrong password OR
nonexistent user**. better-auth's `sign-in/email` route doesn't ship
account-lockout, so 401 here meant either the credential was wrong
or the user record didn't exist.

## Why

`packages/api/scripts/seed-test-account.ts` exists to call
`auth.api.signUpEmail({ email, password: TEST_ACCOUNT_PASSWORD })`
for every email in `TEST_ACCOUNT_EMAILS` so that the journey scripts
can sign in. But:

- it has no `db:seed-test-account` npm script (`grep -E "seed" packages/api/package.json` is empty),
- it isn't listed in any `Dockerfile` step,
- it isn't called from any CI workflow,
- and `infra/fly/fly.dev.toml`'s `release_command` only runs
  `pnpm --filter @harpa/api db:migrate`.

So when the better-auth migration (2026-06-02) flipped the journeys
from the legacy `/auth/password/verify` (phone + password against a
hand-rolled controller) to `/api/auth/sign-in/email` (email + password
against better-auth), nothing in the deploy pipeline ever materialised
`alice@e2e.harpapro.com` in dev's database. Every post-migration
sign-in in journeys 401'd because the user simply didn't exist.

The drift hid because:

1. The api-dev workflow only runs **post-merge** on push to `dev`, so
   no PR ever exercised the deploy → seed → journey path against a
   real Fly app.
2. Yesterday's "last green" api-dev run (`27037095221`, commit
   `75d96ba6`) was running the **pre-better-auth** journey scripts
   (using `/auth/password/verify` + phone), so it never tried the
   email path.
3. Each of PRs #148/#149/#150 chased a *different* failure mode of
   the same underlying issue (response-shape drift, then rate-limit
   429s, then `set -e` swallowing the retry-exhaustion exit), so the
   green PR signal kept saying "this fix landed cleanly" while the
   real bug — no seeded user — sat untouched.

This is a textbook **R3 (post-merge-only blind spot)** instance
multiplied by an **R1 (default-wiring untested)** silent break: a
deploy step that *should* exist (seeding) was never wired in, and
because no CI lane runs the full deploy + journey path against a real
Fly app at PR time, three weeks of dev pushes shipped with the test
account quietly missing.

## Fix

1. Add `"db:seed-test-account": "tsx scripts/seed-test-account.ts"`
   to `packages/api/package.json` so the script has a stable invocation.
2. Chain it into `infra/fly/fly.dev.toml`'s `release_command`:
   ```toml
   release_command = "sh -c 'pnpm --filter @harpa/api db:migrate && pnpm --filter @harpa/api db:seed-test-account'"
   ```
   The seed script already idempotently no-ops on `USER_ALREADY_EXISTS`,
   and short-circuits when `TEST_ACCOUNT_EMAILS` / `TEST_ACCOUNT_PASSWORD`
   are unset — so prod (which deliberately leaves both unset) is
   unaffected.
3. Keep the stress.sh hardening from PRs #148–#150 (401|429 tolerance,
   retry on 429, partial-completion exit on retry exhaustion) and
   additionally swap section A's "wrong password" / "missing password
   field" tests to use a stable bait email outside `TEST_ACCOUNT_EMAILS`
   (`stress-bait-not-in-allowlist@e2e.harpapro.com`). The before-hook in
   `auth/auth.ts` rejects these at 401 *before* the credential check
   runs, so even if better-auth ever ships a per-account lockout in
   the future the stress checks won't burn through real accounts'
   attempt budgets.

## Tests

The structural fix from the v3 pitfalls list applies here:

- **PR-gated `auth.error-shapes.test.ts`** — Testcontainers Postgres
  + Hono `auth.handler`, asserts the 401/200/500 contract on
  `/api/auth/sign-in/email` and `/api/auth/sign-out` so the journey
  scripts have a unit-test mirror, eliminating the "only post-merge
  runs see this" blind spot.
- **PR-gated journey smoke** — call `scripts/journeys/all.sh` against
  a Testcontainers-spawned API in `lint-typecheck`, with the seed
  script run as the test setup. This would have caught both the seed
  gap *and* the response-shape drift the day they landed.

Both are filed in
[`2026-06-06-journey-scripts-better-auth-drift.md`](./2026-06-06-journey-scripts-better-auth-drift.md)
and remain the recommended next chunk; this entry tracks the
immediate fix.

## Pattern

R1 (default-wiring untested) × R3 (post-merge-only blind spot). A
deploy-time setup script existed in the repo but was never wired
into any deploy lane; the only CI that *would* have caught the gap
runs post-merge, so three consecutive `dev` pushes shipped with the
test account silently missing.

## Files

- `packages/api/scripts/seed-test-account.ts` — already existed.
- `packages/api/package.json` — add `db:seed-test-account` script.
- `infra/fly/fly.dev.toml` — chain seed into `release_command`.
- `scripts/journeys/stress.sh` — bait-email refactor in section A.
