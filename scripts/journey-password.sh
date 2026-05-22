#!/usr/bin/env bash
# Test-account password journey — for live deployments (e.g. harpa-pro-api-dev)
# where Twilio is live and we don't want to wait for / pay for SMS.
#
# Requires `TEST_ACCOUNT_PHONES` + `TEST_ACCOUNT_PASSWORD` set in the
# server's Doppler config (the API returns 404 otherwise).
#
# Edit BASE / PHONE / PASSWORD or pass via env, then:
#   BASE=https://harpa-pro-api-dev.fly.dev \
#   PHONE=+15550199001 \
#   PASSWORD='<the dev password>' \
#   bash scripts/journey-password.sh
set -euo pipefail
BASE=${BASE:-http://localhost:8787}
PHONE=${PHONE:-+15550199001}
: "${PASSWORD:?PASSWORD env var is required}"

j() { jq -r "$1"; }
H=(-H 'content-type: application/json')
req() { curl -fsS -X "$1" "$BASE$2" "${H[@]}" ${TOKEN:+-H "authorization: Bearer $TOKEN"} ${3:+-d "$3"}; }

echo "→ password/verify"
TOKEN=$(req POST /auth/password/verify "{\"phone\":\"$PHONE\",\"password\":\"$PASSWORD\"}" | j .token)
echo "→ /me ($(req GET /me '' | j .user.phone))"
echo "→ create project"; PID=$(req POST /projects '{"name":"Journey site (password)"}' | j .id)
echo "→ create report";  RID=$(req POST "/projects/$PID/reports" '{"visitDate":"2026-05-15T08:00:00Z"}' | j .id)
echo "→ add note";       NID=$(req POST "/reports/$RID/notes" '{"kind":"text","body":"hello"}' | j .id)
echo "→ delete note";    req DELETE "/notes/$NID" >/dev/null
echo "→ delete report";  req DELETE "/reports/$RID" >/dev/null
echo "→ delete project"; req DELETE "/projects/$PID" >/dev/null
echo "→ logout";         req POST /auth/logout >/dev/null
echo "✓ done"
