# 2026-06-06 — Journey sign-out posts empty body, API returns HTTP 500

## Symptom

Post-merge api-dev run `27061431499` (after [PR #154]) succeeded at
every business assertion but exited 1. Each of the three journey
scripts logged a clean cleanup tail and then died on the very last
step:

```
→ DELETE project
→ POST /api/auth/sign-out
curl: (22) The requested URL returned error: 500
  ⬆ journey-core: FAILED
```

All three journeys (`core`, `extended`, `stress`) followed the same
pattern: every meaningful assertion passed, then the final sign-out
500'd and tripped `set -e` via `curl --fail`.

## Root cause

Two layers, only the first is fixed here.

### Journey-script layer (this PR)

The end-of-journey sign-out was called with an **empty** request
body:

```bash
req POST /api/auth/sign-out '' >/dev/null
```

`req()` invokes `curl … ${3:+-d "$3"}`, so when `$3` is empty no `-d`
flag is passed at all and the request goes out with no body and no
`Content-Length`. better-auth's sign-out handler tries to parse JSON
unconditionally and the route 500s.

The same script's deliberate negative-path test on line 219 of
`stress.sh` already exercises sign-out with `'{}'` and asserts 200
— so we already had proof that the *only* difference between green
and 500 was sending `{}` vs nothing.

### API layer (filed separately, not fixed here)

The API should treat an empty body to a JSON endpoint as either
"no body" or HTTP 400, not HTTP 500. Same class of bug as the
pre-existing `empty-body → 500 on /api/auth/sign-in/email` we already
test for in `stress.sh` ("empty body: ✓ 500|429"). Tracked in
`2026-06-06-journey-scripts-better-auth-drift.md` followups.

## Fix

Replace `''` with `'{}'` everywhere journey scripts post the final
sign-out. Six call sites across `core.sh`, `extended.sh`, `journey.sh`,
and `stress.sh`.

Verified locally with `bash -n` + `shellcheck -S error`. Real
verification on the next post-merge api-dev run — same R3 blind
spot every fix in this thread has bumped against (only `dev` push
exercises the journey-runner step; PRs only cover `lint-typecheck`
self-tests).

## Why not seen earlier

The auth blocker (PRs #151–#153) prevented journeys from ever reaching
the cleanup-and-sign-out tail, so this 500 was structurally
unreachable until last hour. Same gap that hid the report-body wire
drift in `2026-06-06-journeys-report-body-wire-drift.md`.

## Followups

- API: map empty-body / malformed-JSON to HTTP 400 in better-auth
  routes. Add `auth.error-shapes.test.ts` (PR-gated) to lock the
  contract.
- Add a PR-gated journey smoke test (Testcontainers + minimal
  `scripts/journeys/all.sh`) so the end-of-journey sign-out is
  exercised before merge.

[PR #154]: https://github.com/patrickchin/harpa-pro/pull/154
