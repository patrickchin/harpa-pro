# Manual API cheatsheet

Curl-driven smoke test of `@harpa/api` running locally in fixture mode.
No real Twilio, no real AI provider, no R2.

## 0. Prereqs (one-time)

- Docker Desktop running (for Postgres).
- `pnpm install` already run from repo root.

## 1. Start Postgres + run migrations

```bash
docker rm -f harpa-pg 2>/dev/null
docker run -d --name harpa-pg -p 5433:5432 \
  -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=harpa postgres:16

# wait for ready
until docker exec harpa-pg pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

export DATABASE_URL='postgres://postgres:pg@localhost:5433/harpa'
pnpm --filter @harpa/api db:migrate
```

Stop later with `docker rm -f harpa-pg`.

## 2. Start the API (fixture mode)

```bash
DATABASE_URL='postgres://postgres:pg@localhost:5433/harpa' \
R2_FIXTURE_MODE=replay \
pnpm --filter @harpa/api dev
```

Listens on `:8787`. `R2_FIXTURE_MODE=replay` is **required** — without
it `pickStorage()` returns `R2Storage`, whose methods all throw.

No Twilio in v4 — auth is email-OTP via better-auth. In dev (NODE_ENV
!= production) the `POST /api/dev/last-otp` endpoint exposes the most
recent OTP for an email so curl/Maestro flows can finish the sign-in
without Resend. The route is locked behind a shared-secret header
(`x-dev-otp-token`) plus an `@e2e.harpapro.com` domain allowlist —
see [`arch-auth-and-rls.md`](arch-auth-and-rls.md) §Dev OTP
introspection.

## 3. Curl flow

Run from a second terminal.

```bash
B=http://127.0.0.1:8787
J='content-type: application/json'

# --- auth ---------------------------------------------------------------
EMAIL='alice@e2e.harpapro.com'
curl -sX POST $B/api/auth/email-otp/send-verification-otp -H "$J" \
  -d "{\"email\":\"$EMAIL\",\"type\":\"sign-in\"}" | jq
# /api/dev/last-otp requires the x-dev-otp-token shared secret (matched
# constant-time against env.DEV_OTP_TOKEN). Email must end in
# @e2e.harpapro.com — every other domain returns 404. Export
# DEV_OTP_TOKEN in your shell before running this; the API also needs
# it set or the route is not even mounted. See
# docs/v4/arch-auth-and-rls.md §Dev OTP introspection.
OTP=$(curl -sX POST $B/api/dev/last-otp \
  -H "$J" -H "x-dev-otp-token: $DEV_OTP_TOKEN" \
  -d "{\"email\":\"$EMAIL\"}" | jq -r .otp)
TOKEN=$(curl -sD - -X POST $B/api/auth/sign-in/email-otp -H "$J" \
  -d "{\"email\":\"$EMAIL\",\"otp\":\"$OTP\"}" -o /dev/null \
  | awk 'tolower($1)=="set-auth-token:" {print $2}' | tr -d '\r\n')
H="authorization: Bearer $TOKEN"

# --- project + draft report --------------------------------------------
PID=$(curl -sX POST $B/projects -H "$H" -H "$J" \
  -d '{"name":"Manual"}' | jq -r .id)
RID=$(curl -sX POST $B/projects/$PID/reports -H "$H" -H "$J" \
  -d '{}' | jq -r .id)

# --- P1.7 reports AI/PDF -----------------------------------------------
# generate (default fixture: generate-report.voice-1)
curl -sX POST $B/reports/$RID/generate   -H "$H" -H "$J" -d '{}' | jq

# regenerate with the sparse-notes fixture
curl -sX POST $B/reports/$RID/regenerate -H "$H" -H "$J" \
  -d '{"fixtureName":"generate-report.voice-4"}' | jq

# pdf — returns signed URL with server-built key users/<userId>/pdf/<uuid>.pdf
curl -sX POST $B/reports/$RID/pdf        -H "$H" -H "$J" | jq

# finalize — idempotent
curl -sX POST $B/reports/$RID/finalize   -H "$H" -H "$J" | jq

# generate after finalize → 409
curl -sX POST $B/reports/$RID/regenerate -H "$H" -H "$J" -d '{}' | jq

# --- error envelopes ----------------------------------------------------
# 502 + code=ai_provider_error (operator log shows the real fixture-miss;
# wire body stays generic — no fixture name, hash, or vendor leaks)
RID2=$(curl -sX POST $B/projects/$PID/reports -H "$H" -H "$J" -d '{}' | jq -r .id)
curl -sX POST $B/reports/$RID2/generate -H "$H" -H "$J" \
  -d '{"fixtureName":"does-not-exist"}' | jq

# 400 — fixtureName traversal rejected at the contract boundary
curl -sX POST $B/reports/$RID2/generate -H "$H" -H "$J" \
  -d '{"fixtureName":"../../../etc/passwd"}' | jq

# 401 — no bearer
curl -sX POST $B/reports/$RID2/generate -H "$J" -d '{}' | jq

# 404 — unknown reportId
curl -sX POST $B/reports/00000000-0000-0000-0000-000000000000/generate \
  -H "$H" -H "$J" -d '{}' | jq
```

## 4. Other useful endpoints

```bash
# OpenAPI spec
curl -s $B/openapi.json | jq 'keys'

# Voice (needs an app.files row first — easier from the integration test
# helpers than via curl)
curl -sX POST $B/voice/summarize -H "$H" -H "$J" \
  -d '{"transcript":"anything"}' | jq

# Logout (revokes current session)
curl -sX POST $B/api/auth/sign-out -H "$H" | jq
```

## Notes / gotchas

- Verify response field is **`token`**, not `accessToken`.
- Fixture canonicals (vendor, model, prompts, audio URL) live in
  `packages/api/src/services/ai.ts` `FIXTURE_CANONICALS`. Caller inputs
  are normalised to these in replay mode so the request hash always
  matches the recorded fixtures under
  `packages/ai-fixtures/fixtures/`.
- Available report fixtures: `generate-report.voice-1` (default, rich
  body) through `generate-report.voice-5`. `voice-4` is the sparse
  case (empty workers/materials, single summary section).
- Server builds every storage key (`users/<userId>/<kind>/<uuid>.<ext>`).
  Client never specifies a key.
- `R2Storage.{presign, signGet, putObject}` are stubs that throw —
  always run with `R2_FIXTURE_MODE=replay` until the live R2 wiring
  lands.
