#!/usr/bin/env bash
# Edit BASE/PHONE then: bash scripts/journey.sh
# Requires: jq. API must run with TWILIO_LIVE=0 (default).
set -euo pipefail
BASE=${BASE:-http://localhost:8787}
PHONE=${PHONE:-+15550199001}
CODE=${CODE:-000000}

j() { jq -r "$1"; }
H=(-H 'content-type: application/json')
req() { curl -fsS -X "$1" "$BASE$2" "${H[@]}" ${TOKEN:+-H "authorization: Bearer $TOKEN"} ${3:+-d "$3"}; }

echo "→ otp/start";  req POST /auth/otp/start  "{\"phone\":\"$PHONE\"}" >/dev/null
echo "→ otp/verify"; TOKEN=$(req POST /auth/otp/verify "{\"phone\":\"$PHONE\",\"code\":\"$CODE\"}" | j .token)
echo "→ /me ($(req GET /me '' | j .user.phone))"
echo "→ create project"; PID=$(req POST /projects '{"name":"Journey site"}' | j .id)
echo "→ create report";  RID=$(req POST "/projects/$PID/reports" '{"visitDate":"2026-05-15T08:00:00Z"}' | j .id)
echo "→ add note";       NID=$(req POST "/reports/$RID/notes" '{"kind":"text","body":"hello"}' | j .id)
echo "→ delete note";    req DELETE "/notes/$NID" >/dev/null
echo "→ delete report";  req DELETE "/reports/$RID" >/dev/null
echo "→ delete project"; req DELETE "/projects/$PID" >/dev/null
echo "→ logout";         req POST /auth/logout >/dev/null
echo "✓ done"
