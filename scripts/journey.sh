#!/usr/bin/env bash
# End-to-end smoke test for a live API deployment, logging in with the
# test-account password (`POST /auth/password/verify`). Hits every CRUD
# surface so a regression in any "boring" endpoint shows up here.
#
# AI- and upload-heavy endpoints (`/voice/*`, `/files/*`,
# `/.../reports/.../generate`, `/regenerate`) are NOT exercised: they
# would require an R2 upload round-trip or live AI spend (the dev
# deployment doesn't run in `AI_FIXTURE_MODE=replay`). The unit +
# integration suites cover them with fixtures. To exercise the
# finalize / unfinalize / pdf path without burning AI tokens, the
# journey PATCHes a minimal report body in directly.
#
# Requires: jq. The target deployment must have `TEST_ACCOUNT_PHONES`
# and `TEST_ACCOUNT_PASSWORD` set (Doppler `dev` does; `prd` does not).
#
# Defaults target the dev Fly deployment. Override via env:
#   BASE=https://harpa-pro-api-dev.fly.dev \
#   PHONE=+15550199001 \
#   PASSWORD="$(doppler secrets get TEST_ACCOUNT_PASSWORD \
#                  --project harpa-pro --config dev --plain)" \
#     bash scripts/journey.sh
set -euo pipefail

BASE=${BASE:-https://harpa-pro-api-dev.fly.dev}
PHONE=${PHONE:-+15550199001}
: "${PASSWORD:?PASSWORD env var is required (test-account password from Doppler)}"

j() { jq -r "$1"; }
H=(-H 'content-type: application/json')
# `req METHOD PATH [BODY]` — adds Bearer when TOKEN is set, body when given.
req() {
  curl -fsS -X "$1" "$BASE$2" "${H[@]}" \
    ${TOKEN:+-H "authorization: Bearer $TOKEN"} \
    ${3:+-d "$3"}
}

echo "→ healthz";            req GET /healthz '' >/dev/null
echo "→ readyz";             req GET /readyz  '' >/dev/null

echo "→ password/verify"
TOKEN=$(req POST /auth/password/verify \
  "{\"phone\":\"$PHONE\",\"password\":\"$PASSWORD\"}" | j .token)

echo "→ GET /me ($(req GET /me '' | j .user.phone))"
echo "→ PATCH /me"
req PATCH /me '{"displayName":"Journey Bot","companyName":"Journey Co"}' >/dev/null
echo "→ GET /me/usage";      req GET /me/usage '' >/dev/null

echo "→ GET /settings/ai";   req GET /settings/ai '' >/dev/null
echo "→ PATCH /settings/ai"
req PATCH /settings/ai '{"vendor":"kimi"}' >/dev/null

echo "→ GET /projects";      req GET /projects '' >/dev/null
echo "→ POST /projects"
PID=$(req POST /projects \
  '{"name":"Journey site","clientName":"Acme","address":"1 Test Way"}' | j .id)
echo "  pid=$PID"
echo "→ GET /projects/$PID"; req GET "/projects/$PID" '' >/dev/null
echo "→ PATCH /projects/$PID"
req PATCH "/projects/$PID" '{"name":"Journey site (renamed)"}' >/dev/null
echo "→ GET /projects/$PID/members"
req GET "/projects/$PID/members" '' >/dev/null
echo "→ GET /p/$PID (resolver)"
req GET "/p/$PID" '' >/dev/null

echo "→ GET /projects/$PID/reports"
req GET "/projects/$PID/reports" '' >/dev/null
echo "→ POST /projects/$PID/reports"
REPORT=$(req POST "/projects/$PID/reports" \
  '{"visitDate":"2026-05-15T08:00:00Z"}')
RID=$(echo "$REPORT" | j .id)
RNUM=$(echo "$REPORT" | j .number)
echo "  rid=$RID number=$RNUM"
echo "→ GET /projects/$PID/reports/$RNUM"
req GET "/projects/$PID/reports/$RNUM" '' >/dev/null
echo "→ GET /projects/$PID/reports/$RNUM/debug"
req GET "/projects/$PID/reports/$RNUM/debug" '' >/dev/null
echo "→ PATCH /projects/$PID/reports/$RNUM (set minimal body so finalize/pdf work)"
req PATCH "/projects/$PID/reports/$RNUM" '{
  "visitDate":"2026-05-16T09:00:00Z",
  "body":{
    "visitDate":"2026-05-16T09:00:00Z",
    "weather":null,
    "workers":[],
    "materials":[],
    "issues":[],
    "nextSteps":["Follow up next week"],
    "summarySections":[{"title":"Summary","body":"Journey smoke test body."}]
  }
}' >/dev/null
echo "→ GET /r/$RID (resolver)"
req GET "/r/$RID" '' >/dev/null

echo "→ GET /reports/$RID/notes"
req GET "/reports/$RID/notes" '' >/dev/null
echo "→ POST /reports/$RID/notes"
NID=$(req POST "/reports/$RID/notes" \
  '{"kind":"text","body":"journey note"}' | j .id)
echo "  nid=$NID"
echo "→ PATCH /notes/$NID"
req PATCH "/notes/$NID" '{"body":"journey note (edited)"}' >/dev/null

echo "→ POST /projects/$PID/reports/$RNUM/finalize"
req POST "/projects/$PID/reports/$RNUM/finalize" '' >/dev/null
echo "→ POST /projects/$PID/reports/$RNUM/pdf"
req POST "/projects/$PID/reports/$RNUM/pdf" '' >/dev/null
echo "→ POST /projects/$PID/reports/$RNUM/unfinalize"
req POST "/projects/$PID/reports/$RNUM/unfinalize" '' >/dev/null

echo "→ DELETE /notes/$NID"
req DELETE "/notes/$NID" >/dev/null
echo "→ DELETE /projects/$PID/reports/$RNUM"
req DELETE "/projects/$PID/reports/$RNUM" >/dev/null
echo "→ DELETE /projects/$PID"
req DELETE "/projects/$PID" >/dev/null

echo "→ POST /auth/logout"
req POST /auth/logout '' >/dev/null

echo "✓ done"
