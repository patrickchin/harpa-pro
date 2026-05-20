#!/usr/bin/env bash
# Curl-only smoke journey against a deployed @harpa/api.
#
# Targets the *currently shipped* API surface — only routes that exist
# on prod (https://api.harpapro.com/openapi.json) so this script stays
# green after every push to `main`. Anything that requires real R2
# bytes, real AI providers, or routes still in flight on feat/v4
# is deliberately out of scope; those live in
# apps/cli/scripts/journey*.sh against the local docker-compose stack.
#
# Usage:
#   BASE=https://api.harpapro.com          bash scripts/journey.sh
#   BASE=https://harpa-pro-api-dev.fly.dev bash scripts/journey.sh
#   BASE=http://localhost:8787             bash scripts/journey.sh
#
# Prereqs: curl, jq. The target API must run with TWILIO_LIVE=0
# (currently true for prod + dev + local fixture mode), so the canned
# OTP code 000000 is accepted.
#
# Each run uses a unique phone number so concurrent runs (CI + a human
# poking the same env) don't collide on sessions or leftover state.
# The journey cleans up every project/report/note it creates; the
# registered user is left behind (no API for self-delete yet).
set -euo pipefail

BASE=${BASE:-http://localhost:8787}
SUFFIX=${SUFFIX:-$(printf "%04d" $(( RANDOM % 10000 )))}
PHONE=${PHONE:-+155501${SUFFIX}}
CODE=${CODE:-000000}

j() { jq -r "$1"; }
H=(-H 'content-type: application/json')
req() {
  # $1=method  $2=path  $3=(optional) JSON body
  curl -fsS -X "$1" "$BASE$2" "${H[@]}" \
    ${TOKEN:+-H "authorization: Bearer $TOKEN"} \
    ${3:+-d "$3"}
}

echo "→ healthz";        curl -fsS "$BASE/healthz" >/dev/null
echo "→ otp/start";      req POST /auth/otp/start  "{\"phone\":\"$PHONE\"}" >/dev/null
echo "→ otp/verify";     TOKEN=$(req POST /auth/otp/verify "{\"phone\":\"$PHONE\",\"code\":\"$CODE\"}" | j .token)
echo "→ /me ($(req GET /me '' | j .user.phone))"
echo "→ /me/usage";      req GET /me/usage '' >/dev/null
echo "→ create project"; PID=$(req POST /projects '{"name":"Journey site"}' | j .id)
echo "→ list projects";  req GET /projects '' >/dev/null
echo "→ get project";    req GET "/projects/$PID" '' >/dev/null
echo "→ /p/<id>";        req GET "/p/$PID" '' >/dev/null
echo "→ create report";  RJSON=$(req POST "/projects/$PID/reports" '{"visitDate":"2026-05-15T08:00:00Z"}')
RID=$(echo "$RJSON" | j .id)
RNUM=$(echo "$RJSON" | j .number)
echo "  report id=$RID number=$RNUM"
echo "→ get report";     req GET "/projects/$PID/reports/$RNUM" '' >/dev/null
echo "→ /r/<id>";        req GET "/r/$RID" '' >/dev/null
echo "→ list reports";   req GET "/projects/$PID/reports" '' >/dev/null
echo "→ add note";       NID=$(req POST "/reports/$RID/notes" '{"kind":"text","body":"hello"}' | j .id)
echo "→ delete note";    req DELETE "/notes/$NID" >/dev/null
echo "→ delete report";  req DELETE "/projects/$PID/reports/$RNUM" >/dev/null
echo "→ delete project"; req DELETE "/projects/$PID" >/dev/null
echo "→ logout";         req POST /auth/logout '' >/dev/null
echo "✓ done"
