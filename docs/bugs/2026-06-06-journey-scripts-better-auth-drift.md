# 2026-06-06 — Journey scripts asserted pre-better-auth contract

## Smell

After PR #147 fixed the `routes/dev.ts` boot crash and `/readyz`
finally went green on dev, the next `api-dev.yml` step —
`Post-deploy journey tests` — failed in all three journeys
(stress, core, extended). The failure looked like a fresh
regression but was actually a long-latent drift: the journey
shell scripts under `scripts/journeys/*.sh` still encoded the
old auth API contract (custom `/auth/*` routes that returned 400
for malformed bodies) and had not been updated when we migrated
to better-auth on 2026-06-02 (commit 33d6b38f).

The drift was invisible because the journey scripts only run
post-deploy from `api-dev.yml` / `api-prod.yml` — never in PR CI
— and the immediately preceding bug (the dev.ts boot crash) had
been masking every post-deploy run for days, so the journey
failures were "expected to fail" until the boot crash was fixed.

## Root cause

Two unrelated truths collided:

1. **The journeys were written against the v3 auth surface.** The
   stress journey expected `400 Bad Request` for empty email,
   invalid email format, missing password field, empty body, and
   malformed JSON; and `401` for `POST /api/auth/sign-out` with a
   fake bearer token. None of those matched better-auth's actual
   semantics.

2. **better-auth normalises invalid creds aggressively.** Any
   sign-in attempt that fails its credential check — wrong
   password, missing email, empty email, malformed email address,
   missing password field — collapses to `401 Invalid email or
   password`. There is no field-level 400 from better-auth's
   email/password adapter; the API surface intentionally gives no
   oracle on which field was at fault. Sign-out is idempotent and
   always returns 200 even with a fake bearer token (this is by
   design: the route is meant to be safe to call from "log me out
   everywhere" UIs even if the local session is already gone).

A third issue is real but separate: empty body and malformed JSON
on `POST /api/auth/sign-in/email` currently return **500**, not
400. better-auth lets the body parser exception bubble; we have
no error-mapper layer in front of `auth.handler`. This is tracked
as a follow-up — the journey now asserts the current 500 so the
test stays honest, with a comment to flip the expectation when
the mapper lands.

## Fix

`scripts/journeys/stress.sh`:

- Change `400 → 401` for: empty email, invalid email format,
  missing password field. Comment explains better-auth's
  collapse-to-401 behavior.
- Keep `500` (with explicit comment) for: empty body, malformed
  JSON. Note the follow-up to map JSON parse errors to 400.
- Change `401 → 200` for the fake-token sign-out check, with a
  comment explaining better-auth's idempotent sign-out semantics
  and pointing future readers at the protected routes above for
  real auth-boundary coverage.
- Add `sleep 1` between repeated bad sign-in attempts to stay
  under the 120/min per-IP global rate limit (GitHub Actions
  runners share egress IPs and the unauthed bucket can be near
  full at job start).

## Recurrence guard

Journey scripts are post-merge-only test surface (api-dev.yml /
api-prod.yml). The trigger-matrix doc landed in PR #146 already
flags this as a blind spot. Two next-step plays to make this
class of drift impossible:

1. Add an integration test against the real better-auth handler
   under `packages/api/src/__tests__/auth.error-shapes.test.ts`
   asserting the 401 collapse and the 500 → 400 follow-up. That
   test runs in PR CI under `lint-typecheck` and would have caught
   this drift the day better-auth landed.
2. Promote a fast subset of `stress.sh` into a PR-gated "API
   contract" smoke job that boots a Testcontainers Postgres,
   `pnpm dev:api` against it, and runs the journey assertions.
   Tracked as a separate piece of work — the `scripts/journeys/`
   blind spot is broader than auth.
