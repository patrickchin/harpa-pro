#!/usr/bin/env bash
# Journey 2: EXTENDED FEATURES
# ───────────────────────────────────────────────────────────────────────
# Covers secondary features and light negative-path checks:
#   - Multiple note types (text, image, voice, document)
#   - Project member management (invite, role change, removal)
#   - Report lifecycle (regenerate, edit finalized → fail)
#   - Pagination (projects, reports, notes)
#   - Settings management
#   - Basic 404s and validation errors (light, not exhaustive)
#   - File download URL verification
#
# NOT a stress test — just ensures the "second tier" features work and
# that obviously wrong requests get the correct error codes.
#
# Requires: jq, curl.
# Usage: same env vars as journey-core.sh
set -euo pipefail

BASE=${BASE:-https://harpa-pro-api-dev.fly.dev}
PHONE=${PHONE:-+15550199001}
PHONE2=${PHONE2:-+15550199002}
: "${PASSWORD:?PASSWORD env var is required}"

SAMPLES="$(cd "$(dirname "$0")/../apps/cli/scripts/samples" && pwd)"
IMG="$SAMPLES/sample.png"
PDF_FILE="$SAMPLES/sample.pdf"
TXT_FILE="$SAMPLES/sample.txt"
WAV_FILE="$SAMPLES/sample.wav"

# ── Helpers ────────────────────────────────────────────────────────────

j() { jq -r "$1"; }
H=(-H 'content-type: application/json')

req() {
  curl -fsS -X "$1" "$BASE$2" "${H[@]}" \
    ${TOKEN:+-H "authorization: Bearer $TOKEN"} \
    ${3:+-d "$3"}
}

# Returns HTTP status code without failing on 4xx/5xx.
status_of() {
  curl -sS -o /dev/null -w '%{http_code}' -X "$1" "$BASE$2" "${H[@]}" \
    ${TOKEN:+-H "authorization: Bearer $TOKEN"} \
    ${3:+-d "$3"}
}

# Assert expected status code.
assert_status() {
  local expected="$1"; shift
  local got; got=$(status_of "$@")
  if [[ "$got" != "$expected" ]]; then
    echo "  ✗ expected $expected, got $got ($(echo "$@"))" >&2; exit 1
  fi
  echo "  ✓ $expected"
}

upload_file() {
  local kind="$1" ct="$2" path="$3"
  local size; size=$(wc -c < "$path" | tr -d ' ')
  local presign; presign=$(req POST /files/presign \
    "{\"kind\":\"$kind\",\"contentType\":\"$ct\",\"sizeBytes\":$size}")
  local upload_url; upload_url=$(echo "$presign" | j .uploadUrl)
  local file_key;   file_key=$(echo "$presign"   | j .fileKey)
  curl -fsS -X PUT "$upload_url" \
    -H "Content-Type: $ct" \
    --data-binary "@$path" >/dev/null
  req POST /files \
    "{\"kind\":\"$kind\",\"fileKey\":\"$file_key\",\"sizeBytes\":$size,\"contentType\":\"$ct\"}" \
    | j .id
}

echo "═══════════════════════════════════════════════════════════════"
echo " JOURNEY-EXTENDED: Secondary features + light negative paths"
echo " target: $BASE"
echo "═══════════════════════════════════════════════════════════════"

# ── 1. Auth ───────────────────────────────────────────────────────────

echo "→ login (user 1: $PHONE)"
TOKEN=$(req POST /auth/password/verify \
  "{\"phone\":\"$PHONE\",\"password\":\"$PASSWORD\"}" | j .token)
TOKEN1="$TOKEN"
echo "  ✓ logged in"

# Try to ensure user 2 exists (requires PHONE2 in TEST_ACCOUNT_PHONES)
HAS_USER2=false
echo "→ login (user 2: $PHONE2 — ensure exists)"
set +e
TOKEN2=$(req POST /auth/password/verify \
  "{\"phone\":\"$PHONE2\",\"password\":\"$PASSWORD\"}" 2>/dev/null | j .token)
if [[ -n "$TOKEN2" && "$TOKEN2" != "null" ]]; then
  HAS_USER2=true
  TOKEN="$TOKEN2"
  req POST /auth/logout '' >/dev/null
  TOKEN="$TOKEN1"
  echo "  ✓ user 2 exists"
else
  echo "  ⚠️  user 2 unavailable (PHONE2 not in TEST_ACCOUNT_PHONES) — member tests will be skipped"
fi
set -e

# ── 2. Profile edge cases ────────────────────────────────────────────

echo "→ PATCH /me with empty body (no-op, should succeed)"
assert_status 200 PATCH /me '{}'

echo "→ PATCH /me with valid fields"
req PATCH /me '{"displayName":"Extended User"}' >/dev/null

# ── 3. Settings ──────────────────────────────────────────────────────

echo "→ GET /settings/ai"
AI_SETTINGS=$(req GET /settings/ai '')
echo "  vendor=$(echo "$AI_SETTINGS" | j '.vendor // "default"')"

echo "→ PATCH /settings/ai (invalid vendor)"
assert_status 400 PATCH /settings/ai '{"vendor":"nonexistent_vendor"}'

echo "→ PATCH /settings/ai (valid)"
req PATCH /settings/ai '{"vendor":"openai"}' >/dev/null
echo "  ✓ updated"

# ── 4. Projects + pagination ─────────────────────────────────────────

echo "→ POST /projects (A)"
PID_A=$(req POST /projects \
  '{"name":"Extended Site A","clientName":"Alpha Inc","address":"1 Alpha St"}' | j .id)
echo "  pid_a=$PID_A"

echo "→ POST /projects (B)"
PID_B=$(req POST /projects \
  '{"name":"Extended Site B","clientName":"Beta Corp","address":"2 Beta Ave"}' | j .id)
echo "  pid_b=$PID_B"

echo "→ GET /projects (pagination)"
PROJECTS=$(req GET '/projects?limit=1' '')
NEXT=$(echo "$PROJECTS" | j '.nextCursor // empty')
if [[ -n "$NEXT" ]]; then
  echo "  ✓ page 1 has nextCursor"
  req GET "/projects?limit=1&cursor=$NEXT" '' >/dev/null
  echo "  ✓ page 2 fetched"
fi

# ── 5. Project members (requires user 2) ─────────────────────────────

if [[ "$HAS_USER2" == "true" ]]; then
  echo "→ POST /projects/$PID_A/members (invite phone2)"
  req POST "/projects/$PID_A/members" \
    "{\"phone\":\"$PHONE2\",\"role\":\"editor\"}" >/dev/null
  echo "  ✓ member invited"

  echo "→ GET /projects/$PID_A/members"
  MEMBERS=$(req GET "/projects/$PID_A/members" '')
  MEMBER_COUNT=$(echo "$MEMBERS" | j '.items | length')
  echo "  members: $MEMBER_COUNT"

  echo "→ PATCH member role → viewer"
  MEMBER_UID=$(echo "$MEMBERS" | j '.items[] | select(.role=="editor") | .userId')
  if [[ -n "$MEMBER_UID" ]]; then
    req PATCH "/projects/$PID_A/members/$MEMBER_UID" '{"role":"viewer"}' >/dev/null
    echo "  ✓ role changed to viewer"
  fi

  echo "→ DELETE member"
  if [[ -n "$MEMBER_UID" ]]; then
    req DELETE "/projects/$PID_A/members/$MEMBER_UID" >/dev/null
    echo "  ✓ member removed"
  fi
else
  echo "── skipping member management (no user 2) ──"
fi

# ── 6. Reports + multiple notes ──────────────────────────────────────

echo "→ POST /projects/$PID_A/reports"
REPORT=$(req POST "/projects/$PID_A/reports" \
  '{"visitDate":"2026-05-18T10:00:00Z"}')
RID=$(echo "$REPORT" | j .id)
RNUM=$(echo "$REPORT" | j .number)
echo "  rid=$RID number=$RNUM"

echo "→ POST text note"
NID1=$(req POST "/reports/$RID/notes" \
  '{"kind":"text","body":"Concrete delivered. 20 m³ poured in section B."}' | j .id)

echo "→ POST second text note"
NID2=$(req POST "/reports/$RID/notes" \
  '{"kind":"text","body":"Rebar inspection passed. Ready for second pour tomorrow."}' | j .id)

echo "→ upload + POST image note"
IMG_FID=$(upload_file image image/png "$IMG")
NID3=$(req POST "/reports/$RID/notes" \
  "{\"kind\":\"image\",\"fileId\":\"$IMG_FID\",\"body\":\"Section B after pour\"}" | j .id)

echo "→ upload + POST document note (PDF)"
PDF_FID=$(upload_file pdf application/pdf "$PDF_FILE")
NID4=$(req POST "/reports/$RID/notes" \
  "{\"kind\":\"document\",\"fileId\":\"$PDF_FID\",\"body\":\"Inspection certificate\"}" | j .id)

echo "→ upload + POST voice note (WAV, no transcription)"
WAV_FID=$(upload_file voice audio/wav "$WAV_FILE")
NID5=$(req POST "/reports/$RID/notes" \
  "{\"kind\":\"voice\",\"fileId\":\"$WAV_FID\"}" | j .id)

echo "  notes created: 5"

# ── 7. Note editing ──────────────────────────────────────────────────

echo "→ PATCH note (edit text body)"
req PATCH "/notes/$NID1" '{"body":"Concrete delivered. 20 m³ poured in section B. No issues."}' >/dev/null
echo "  ✓ note updated"

# ── 8. Notes pagination ──────────────────────────────────────────────

echo "→ GET /reports/$RID/notes?limit=2 (pagination)"
NOTES_P1=$(req GET "/reports/$RID/notes?limit=2" '')
NOTE_NEXT=$(echo "$NOTES_P1" | j '.nextCursor // empty')
if [[ -n "$NOTE_NEXT" ]]; then
  echo "  ✓ notes pagination works (has nextCursor)"
fi

# ── 9. File download URL ─────────────────────────────────────────────

echo "→ GET /files/$IMG_FID/url"
FILE_URL=$(req GET "/files/$IMG_FID/url" '' | j '.url // empty')
if [[ -n "$FILE_URL" ]]; then
  echo "  ✓ signed download URL obtained (${#FILE_URL} chars)"
fi

# ── 10. Report lifecycle ─────────────────────────────────────────────

echo "→ PATCH report (set body)"
req PATCH "/projects/$PID_A/reports/$RNUM" '{
  "body":{
    "visitDate":"2026-05-18T10:00:00Z",
    "weather":{"condition":"Overcast","temperatureC":18,"windKph":10,"impact":null},
    "workers":[{"role":"Foreman","count":1,"hours":8,"notes":null},{"role":"Labourer","count":3,"hours":8,"notes":null}],
    "materials":[{"name":"Concrete","quantity":20,"unit":"m³","status":"poured","condition":"good","notes":null},{"name":"Rebar","quantity":null,"unit":null,"status":"installed","condition":"grade 60","notes":null}],
    "issues":[],
    "nextSteps":["Second pour section B"],
    "summarySections":[{"title":"Daily Summary","body":"Concrete pour completed successfully."}]
  }
}' >/dev/null

echo "→ finalize"
req POST "/projects/$PID_A/reports/$RNUM/finalize" '' >/dev/null
echo "  ✓ finalized"

echo "→ PATCH finalized report (expect 4xx)"
assert_status 409 PATCH "/projects/$PID_A/reports/$RNUM" '{
  "body":{"visitDate":null,"weather":null,"workers":[],"materials":[],"issues":[],"nextSteps":[],"summarySections":[{"title":"hack","body":"should fail"}]}
}'

echo "→ pdf"
req POST "/projects/$PID_A/reports/$RNUM/pdf" '' >/dev/null
echo "  ✓ pdf generated"

echo "→ unfinalize"
req POST "/projects/$PID_A/reports/$RNUM/unfinalize" '' >/dev/null
echo "  ✓ unfinalized"

# ── 11. Basic 404 checks ─────────────────────────────────────────────

echo "── light negative paths ──"

echo "→ GET non-existent project"
assert_status 404 GET /projects/prj_000000000000 ''

echo "→ GET non-existent report"
assert_status 404 GET "/projects/$PID_A/reports/9999" ''

echo "→ DELETE non-existent note"
assert_status 404 DELETE /notes/not_000000000000

echo "→ POST project missing required field"
assert_status 400 POST /projects '{"clientName":"no name field"}'

echo "→ POST note with invalid kind"
assert_status 400 POST "/reports/$RID/notes" '{"kind":"invalid","body":"x"}'

# ── 12. Resolver endpoints ───────────────────────────────────────────

echo "→ GET /p/$PID_A (project resolver)"
req GET "/p/$PID_A" '' >/dev/null
echo "  ✓ resolved"

echo "→ GET /r/$RID (report resolver)"
req GET "/r/$RID" '' >/dev/null
echo "  ✓ resolved"

# ── 13. Cleanup ──────────────────────────────────────────────────────

echo "── cleanup ──"
for nid in $NID1 $NID2 $NID3 $NID4 $NID5; do
  req DELETE "/notes/$nid" >/dev/null
done
echo "  ✓ notes deleted"
req DELETE "/projects/$PID_A/reports/$RNUM" >/dev/null
echo "  ✓ report deleted"
req DELETE "/projects/$PID_A" >/dev/null
req DELETE "/projects/$PID_B" >/dev/null
echo "  ✓ projects deleted"
req POST /auth/logout '' >/dev/null
echo "  ✓ logged out"

echo ""
echo "✓ JOURNEY-EXTENDED complete"
