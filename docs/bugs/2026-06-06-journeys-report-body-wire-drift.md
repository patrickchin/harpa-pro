# 2026-06-06 — Journey scripts use stale report-body wire shape

## Symptom

After PRs #151–#153 unblocked the auth/seed pipeline, journey-core
and journey-extended started actually authenticating and exercising
the project/report endpoints — and immediately failed at the first
`PATCH /projects/{p}/reports/{n}` with HTTP 400. The first failure
got logged from api-dev run `27061044266`:

```
→ PATCH report body (ensure finalization works)
curl: (22) The requested URL returned error: 400
  ⬆ journey-core: FAILED
```

journey-extended hit the same 400 on its own PATCH, plus an
unrelated 409 on `POST /projects/.../members` because the dev
environment only has one test account so EMAIL2 == EMAIL.

## Root cause

Two independent journey-script bugs that had been masked for weeks
by the auth/seed blocker:

### 1. Wire shape drift on `reportBody`

The contract (`packages/api-contract/src/schemas/reports.ts:40-83`)
expects:

- `weather.temperature` (string) — NOT `temperatureC` (number)
- `weather.wind` (string) — NOT `windKph` (number)
- `workers[].count`, `workers[].hours` — strings, NOT numbers
- `materials[].quantity` — string, NOT number
- `meta` has no `tags` field

The journey scripts were sending the legacy v3 shape. The
docstring on `reportBody` (lines 16–38) explicitly calls this out:

> Wire shape — string|null for every numeric / categorical field
> (workers[].count, workers[].hours, materials[].quantity,
> weather.temperature, weather.wind, issues[].severity).
>
> Why strings: this is LLM output extracted from voice transcripts.
> The model frequently sees "a few electricians", "around 20°C", …

The journey scripts predate that migration (HARPA-PRO-6 era —
see `docs/bugs/2026-06-06-report-body-string-wire.md`).

### 2. Self-invite when EMAIL2 == EMAIL

`extended.sh` (line 191) and `stress.sh` (line 309) both invite
`$EMAIL2` as a project member of a project owned by `$EMAIL`. When
a dev environment has only one test account in
`TEST_ACCOUNT_EMAILS_DEV` (the current state) the workflow sets
`EMAIL2 = EMAIL`, and the API correctly rejects with 409 (you're
already a member as the owner).

## Fix

- `core.sh`, `extended.sh`, `stress.sh` — payloads updated to the
  string-wire shape. `meta.tags` removed (not in schema).
- `extended.sh`, `stress.sh` — guard the user-2 / cross-user
  branches on `EMAIL2 != EMAIL` so they skip cleanly when the dev
  env only has one test account.

## Pattern

R3 (post-merge-only blind spot) again. Journey scripts were never
exercised in PR-gated CI, so the wire-shape migration silently broke
them. Until the seed blocker landed, no run ever progressed past
sign-in, so the drift was invisible.

## Files

- `scripts/journeys/core.sh`
- `scripts/journeys/extended.sh`
- `scripts/journeys/stress.sh`
- `docs/bugs/README.md` — index entry
