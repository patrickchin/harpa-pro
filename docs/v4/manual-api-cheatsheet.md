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

`TWILIO_LIVE` unset (default) → fake OTP. Any phone works; the accepted
code is `TWILIO_VERIFY_FAKE_CODE` (default `000000`).

## 3. Curl flow

Run from a second terminal.

```bash
B=http://127.0.0.1:8787
J='content-type: application/json'

# --- auth ---------------------------------------------------------------
curl -sX POST $B/auth/otp/start  -H "$J" -d '{"phone":"+15550000001"}'
TOKEN=$(curl -sX POST $B/auth/otp/verify -H "$J" \
  -d '{"phone":"+15550000001","code":"000000"}' | jq -r .token)
H="authorization: Bearer $TOKEN"

# --- project + draft report --------------------------------------------
PID=$(curl -sX POST $B/projects -H "$H" -H "$J" \
  -d '{"name":"Manual"}' | jq -r .id)
RID=$(curl -sX POST $B/projects/$PID/reports -H "$H" -H "$J" \
  -d '{}' | jq -r .id)

# --- P1.7 reports AI/PDF -----------------------------------------------
# generate (default fixture: generate-report.full)
curl -sX POST $B/reports/$RID/generate   -H "$H" -H "$J" -d '{}' | jq

# regenerate with the alternate fixture
curl -sX POST $B/reports/$RID/regenerate -H "$H" -H "$J" \
  -d '{"fixtureName":"generate-report.incomplete"}' | jq

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
curl -sX POST $B/auth/logout -H "$H" | jq
```

## Notes / gotchas

- Verify response field is **`token`**, not `accessToken`.
- Fixture canonicals (vendor, model, prompts, audio URL) live in
  `packages/api/src/services/ai.ts` `FIXTURE_CANONICALS`. Caller inputs
  are normalised to these in replay mode so the request hash always
  matches the recorded fixtures under
  `packages/ai-fixtures/fixtures/`.
- Available report fixtures: `generate-report.full` (default) and
  `generate-report.incomplete`.
- Server builds every storage key (`users/<userId>/<kind>/<uuid>.<ext>`).
  Client never specifies a key.
- `R2Storage.{presign, signGet, putObject}` are stubs that throw —
  always run with `R2_FIXTURE_MODE=replay` until the live R2 wiring
  lands.
