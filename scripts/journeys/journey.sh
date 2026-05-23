#!/usr/bin/env bash
# End-to-end smoke test for a live API deployment, logging in with the
# test-account password (`POST /auth/password/verify`). Hits every CRUD
# surface so a regression in any "boring" endpoint shows up here,
# including real file uploads (presign → PUT to R2 → register) for an
# image and a voice recording, plus the voice-note aggregator
# (transcribe + summarise via live AI).
#
# `/.../reports/.../generate` and `/regenerate` are NOT exercised — they
# require notes to already exist and burn live AI tokens every run.
# The unit + integration suites cover them with fixtures.
#
# Sample fixture files live at apps/cli/scripts/samples/ and
# apps/mobile/assets/fixtures/ (tiny, license-free: 70-byte 1×1 PNG,
# 1 KB M4A silence).
#
# Requires: jq, curl. The target deployment must have
# `TEST_ACCOUNT_PHONES` and `TEST_ACCOUNT_PASSWORD` set (Doppler `dev`
# does; `prd` does not).
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

SAMPLES="$(cd "$(dirname "$0")/../../apps/cli/scripts/samples" && pwd)"
IMG="$SAMPLES/sample.png"
# Real voice sample for live transcription. Default to the LFS short clip;
# override VOICE_M4A to use a longer one (e.g. samples/real/site-walkthrough.m4a).
VOICE_M4A=${VOICE_M4A:-"$(cd "$(dirname "$0")/../../samples/real" && pwd)/site-rain-10s.m4a"}

j() { jq -r "$1"; }
H=(-H 'content-type: application/json')
# `req METHOD PATH [BODY]` — adds Bearer when TOKEN is set, body when given.
req() {
  curl -fsS -X "$1" "$BASE$2" "${H[@]}" \
    ${TOKEN:+-H "authorization: Bearer $TOKEN"} \
    ${3:+-d "$3"}
}

# upload_file KIND CONTENT_TYPE FILE_PATH
# Presigns, PUTs real bytes to R2, registers, returns the fileId.
upload_file() {
  local kind="$1" ct="$2" path="$3"
  local size; size=$(wc -c < "$path" | tr -d ' ')
  local presign; presign=$(req POST /files/presign \
    "{\"kind\":\"$kind\",\"contentType\":\"$ct\",\"sizeBytes\":$size}")
  local upload_url; upload_url=$(echo "$presign" | j .uploadUrl)
  local file_key;   file_key=$(echo "$presign"   | j .fileKey)
  # PUT real bytes directly to R2 signed URL.
  curl -fsS -X PUT "$upload_url" \
    -H "Content-Type: $ct" \
    --data-binary "@$path" >/dev/null
  # Register the uploaded object with the API.
  req POST /files \
    "{\"kind\":\"$kind\",\"fileKey\":\"$file_key\",\"sizeBytes\":$size,\"contentType\":\"$ct\"}" \
    | j .id
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
req PATCH /settings/ai '{"vendor":"openai"}' >/dev/null

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

echo "→ POST /reports/$RID/notes (text)"
NID=$(req POST "/reports/$RID/notes" \
  '{"kind":"text","body":"journey note"}' | j .id)
echo "  nid=$NID"
echo "→ PATCH /notes/$NID"
req PATCH "/notes/$NID" '{"body":"journey note (edited)"}' >/dev/null

echo "→ upload image (presign → PUT to R2 → register)"
IMG_FID=$(upload_file image image/png "$IMG")
echo "  file_id=$IMG_FID"
echo "→ GET /files/$IMG_FID/url"
req GET "/files/$IMG_FID/url" '' >/dev/null
echo "→ POST /reports/$RID/notes (image)"
IMG_NID=$(req POST "/reports/$RID/notes" \
  "{\"kind\":\"image\",\"fileId\":\"$IMG_FID\"}" | j .id)
echo "  nid=$IMG_NID"

echo "→ upload voice (presign → PUT to R2 → register)"
VOICE_FID=$(upload_file voice audio/mp4 "$VOICE_M4A")
echo "  file_id=$VOICE_FID"
echo "→ GET /files/$VOICE_FID/url"
req GET "/files/$VOICE_FID/url" '' >/dev/null
echo "→ POST /reports/$RID/notes (voice — direct, no AI)"
VOICE_NID=$(req POST "/reports/$RID/notes" \
  "{\"kind\":\"voice\",\"fileId\":\"$VOICE_FID\"}" | j .id)
echo "  nid=$VOICE_NID"
# Also attempt the voice aggregator (transcribe + summarise + note). This
# requires a live AI provider and may fail if AI is unavailable or the
# sample is too short for the provider. Non-fatal: we log a warning so
# CI surfaces the issue without blocking the rest of the journey.
echo "→ POST /reports/$RID/notes/voice (aggregator — transcribe + summarise)"
set +e
VOICE_AGG=$(req POST "/reports/$RID/notes/voice" \
  "{\"fileId\":\"$VOICE_FID\",\"durationSec\":53}" 2>&1)
AGG_STATUS=$?
set -e
if [[ $AGG_STATUS -eq 0 ]]; then
  VOICE_AGG_NID=$(echo "$VOICE_AGG" | j .id)
  echo "  ✓ aggregator nid=$VOICE_AGG_NID"
else
  echo "  ⚠️  voice aggregator failed (AI unavailable or sample too short — expected on dev with live AI)"
  VOICE_AGG_NID=""
fi

echo "→ POST /projects/$PID/reports/$RNUM/finalize"
req POST "/projects/$PID/reports/$RNUM/finalize" '' >/dev/null
echo "→ POST /projects/$PID/reports/$RNUM/pdf"
req POST "/projects/$PID/reports/$RNUM/pdf" '' >/dev/null
echo "→ POST /projects/$PID/reports/$RNUM/unfinalize"
req POST "/projects/$PID/reports/$RNUM/unfinalize" '' >/dev/null

echo "→ DELETE /notes/$NID"
req DELETE "/notes/$NID" >/dev/null
echo "→ DELETE /notes/$IMG_NID"
req DELETE "/notes/$IMG_NID" >/dev/null
echo "→ DELETE /notes/$VOICE_NID"
req DELETE "/notes/$VOICE_NID" >/dev/null
if [[ -n "$VOICE_AGG_NID" ]]; then
  echo "→ DELETE /notes/$VOICE_AGG_NID"
  req DELETE "/notes/$VOICE_AGG_NID" >/dev/null
fi
echo "→ DELETE /projects/$PID/reports/$RNUM"
req DELETE "/projects/$PID/reports/$RNUM" >/dev/null
echo "→ DELETE /projects/$PID"
req DELETE "/projects/$PID" >/dev/null

echo "→ POST /auth/logout"
req POST /auth/logout '' >/dev/null

echo "✓ done"
