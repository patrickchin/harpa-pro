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
# Two auth modes:
#
#   1. TOKEN mode (preferred for CI against real envs):
#        TOKEN=<bearer> BASE=https://api.harpapro.com bash scripts/journey.sh
#      Skips OTP entirely and acts as a pre-provisioned smoke user.
#      See docs/v4/arch-ops.md → "Smoke user provisioning".
#
#   2. OTP mode (local fixture mode + envs running TWILIO_LIVE=0):
#        BASE=http://localhost:8787 bash scripts/journey.sh
#      Registers a fresh user per run via /auth/otp/{start,verify}
#      using the canned fake code (default 000000).
#
# Prereqs: curl, jq.
#
# Each run uses a unique phone number (OTP mode) or a stable bearer
# (TOKEN mode); the journey cleans up every project/report/note it
# creates. In OTP mode the registered user is left behind (no API
# for self-delete yet); TOKEN mode reuses the long-lived smoke user.
set -euo pipefail

BASE=${BASE:-http://localhost:8787}
SUFFIX=${SUFFIX:-$(printf "%04d" $(( RANDOM % 10000 )))}
PHONE=${PHONE:-+155501${SUFFIX}}
CODE=${CODE:-000000}
TOKEN=${TOKEN:-}
TOKEN_FROM_ENV=${TOKEN:+1}

j() { jq -r "$1"; }
H=(-H 'content-type: application/json')
req() {
  # $1=method  $2=path  $3=(optional) JSON body
  curl -fsS -X "$1" "$BASE$2" "${H[@]}" \
    ${TOKEN:+-H "authorization: Bearer $TOKEN"} \
    ${3:+-d "$3"}
}

echo "→ healthz";        curl -fsS "$BASE/healthz" >/dev/null
if [ -z "$TOKEN" ]; then
  echo "→ otp/start";    req POST /auth/otp/start  "{\"phone\":\"$PHONE\"}" >/dev/null
  echo "→ otp/verify";   TOKEN=$(req POST /auth/otp/verify "{\"phone\":\"$PHONE\",\"code\":\"$CODE\"}" | j .token)
else
  echo "→ using provided TOKEN (skipping OTP)"
fi
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
# In TOKEN mode we deliberately skip logout — /auth/logout revokes
# the session for the long-lived smoke bearer, which would break the
# next run. OTP-mode tokens are throwaway, so logging out is fine.
if [ -z "$TOKEN_FROM_ENV" ]; then
  echo "→ logout";       req POST /auth/logout '' >/dev/null
fi
echo "✓ done"
