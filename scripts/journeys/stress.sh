#!/usr/bin/env bash
# Journey 3: STRESS & ABUSE
# ───────────────────────────────────────────────────────────────────────
# Aggressively tests failure modes, authorization boundaries, and misuse:
#   - Wrong/expired/missing credentials
#   - Cross-user access attempts (user B accessing user A's resources)
#   - Permission violations (editor/viewer doing owner-only ops)
#   - Invalid payloads, oversized fields, malformed JSON
#   - Deleting resources you don't own
#   - Operating on finalized reports
#   - Double-delete, double-finalize
#   - Boundary values (empty strings, null fields, huge limits)
#   - Rate-limit probing (optional)
#
# Requires: jq, curl, two test accounts (PHONE, PHONE2 + shared PASSWORD).
#
# Usage:
#   PASSWORD=secret bash scripts/journey-stress.sh
set -euo pipefail

BASE=${BASE:-https://harpa-pro-api-dev.fly.dev}
PHONE=${PHONE:-+15550199001}
PHONE2=${PHONE2:-+15550199002}
: "${PASSWORD:?PASSWORD env var is required}"

SAMPLES="$(cd "$(dirname "$0")/../../apps/cli/scripts/samples" && pwd)"
IMG="$SAMPLES/sample.png"

# ── Helpers ────────────────────────────────────────────────────────────

j() { jq -r "$1"; }
H=(-H 'content-type: application/json')
PASS=0
FAIL=0

req() {
  curl -fsS -X "$1" "$BASE$2" "${H[@]}" \
    ${TOKEN:+-H "authorization: Bearer $TOKEN"} \
    ${3:+-d "$3"}
}

# Returns HTTP status + body. Does not fail on 4xx/5xx.
raw() {
  curl -sS -w '\n%{http_code}' -X "$1" "$BASE$2" "${H[@]}" \
    ${TOKEN:+-H "authorization: Bearer $TOKEN"} \
    ${3:+-d "$3"}
}

# Assert expected HTTP status.
assert_status() {
  local expected="$1"; shift
  local response; response=$(raw "$@")
  local status; status=$(echo "$response" | tail -1)
  if [[ "$status" == "$expected" ]]; then
    ((PASS++)) || true
    return 0
  else
    local body; body=$(echo "$response" | sed '$d' | head -1)
    echo "  ✗ expected $expected, got $status — $body" >&2
    ((FAIL++)) || true
    return 1
  fi
}

# Assert status and print pass/fail.
check() {
  local label="$1"; shift
  echo -n "  $label: "
  if assert_status "$@"; then
    echo "✓ $1"
  fi
}

upload_file() {
  local kind="$1" ct="$2" path="$3" pid="$4" rid="$5"
  local size; size=$(wc -c < "$path" | tr -d ' ')
  local presign; presign=$(req POST /files/presign \
    "{\"scope\":\"project\",\"projectId\":\"$pid\",\"reportId\":\"$rid\",\"kind\":\"$kind\",\"contentType\":\"$ct\",\"sizeBytes\":$size}")
  local upload_url; upload_url=$(echo "$presign" | j .uploadUrl)
  local file_key;   file_key=$(echo "$presign"   | j .fileKey)
  curl -fsS -X PUT "$upload_url" \
    -H "Content-Type: $ct" \
    --data-binary "@$path" >/dev/null
  req POST /files \
    "{\"scope\":\"project\",\"projectId\":\"$pid\",\"reportId\":\"$rid\",\"kind\":\"$kind\",\"fileKey\":\"$file_key\",\"sizeBytes\":$size,\"contentType\":\"$ct\"}" \
    | j .id
}

echo "═══════════════════════════════════════════════════════════════"
echo " JOURNEY-STRESS: Failure modes, auth boundaries, abuse"
echo " target: $BASE"
echo "═══════════════════════════════════════════════════════════════"

# ══════════════════════════════════════════════════════════════════════
# SECTION A: Authentication failures
# ══════════════════════════════════════════════════════════════════════

echo ""
echo "── A. Authentication failures ──"
TOKEN=""

check "wrong password" 401 POST /auth/password/verify \
  "{\"phone\":\"$PHONE\",\"password\":\"wrong_password_123\"}"

check "empty phone" 400 POST /auth/password/verify \
  '{"phone":"","password":"anything"}'

check "invalid phone format" 400 POST /auth/password/verify \
  '{"phone":"not-a-phone","password":"anything"}'

check "missing password field" 400 POST /auth/password/verify \
  "{\"phone\":\"$PHONE\"}"

check "empty body" 400 POST /auth/password/verify ''

check "malformed JSON" 400 POST /auth/password/verify \
  '{this is not json}'

# ══════════════════════════════════════════════════════════════════════
# SECTION B: Unauthenticated access
# ══════════════════════════════════════════════════════════════════════

echo ""
echo "── B. Unauthenticated access ──"

check "GET /me without token" 401 GET /me ''
check "GET /projects without token" 401 GET /projects ''
check "POST /projects without token" 401 POST /projects '{"name":"x"}'
check "GET /settings/ai without token" 401 GET /settings/ai ''
check "POST /files/presign without token" 401 POST /files/presign \
  '{"scope":"scratch","kind":"image","contentType":"image/png","sizeBytes":100}'

# ══════════════════════════════════════════════════════════════════════
# SECTION C: Invalid token
# ══════════════════════════════════════════════════════════════════════

echo ""
echo "── C. Invalid/expired token ──"
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfZmFrZSIsInNpZCI6InNlc19mYWtlIiwiaWF0IjoxfQ.invalid"

check "GET /me with fake token" 401 GET /me ''
check "POST /projects with fake token" 401 POST /projects '{"name":"x"}'
check "POST /auth/logout with fake token" 401 POST /auth/logout ''

# ══════════════════════════════════════════════════════════════════════
# SECTION D: Cross-user access (user B trying user A's resources)
# ══════════════════════════════════════════════════════════════════════

echo ""
echo "── D. Cross-user access ──"

# Login as user A, create resources
TOKEN=$(req POST /auth/password/verify \
  "{\"phone\":\"$PHONE\",\"password\":\"$PASSWORD\"}" | j .token)
TOKEN_A="$TOKEN"
echo "  user A logged in"

PID_A=$(req POST /projects \
  '{"name":"Stress Private Project","clientName":"Private Corp","address":"Secret St"}' | j .id)
echo "  project: $PID_A"

REPORT_A=$(req POST "/projects/$PID_A/reports" '{"visitDate":"2026-05-20T09:00:00Z"}')
RID_A=$(echo "$REPORT_A" | j .id)
RNUM_A=$(echo "$REPORT_A" | j .number)
echo "  report: $RID_A (#$RNUM_A)"

NID_A=$(req POST "/reports/$RID_A/notes" \
  '{"kind":"text","body":"Private note, user A only"}' | j .id)
echo "  note: $NID_A"

# Try login as user B
HAS_USER_B=false
set +e
TOKEN_B=$(req POST /auth/password/verify \
  "{\"phone\":\"$PHONE2\",\"password\":\"$PASSWORD\"}" 2>/dev/null | j .token)
set -e
if [[ -n "$TOKEN_B" && "$TOKEN_B" != "null" ]]; then
  HAS_USER_B=true
  echo "  user B logged in"

  TOKEN="$TOKEN_B"
  check "B: GET A's project" 404 GET "/projects/$PID_A" ''
  check "B: PATCH A's project" 404 PATCH "/projects/$PID_A" '{"name":"hacked"}'
  check "B: DELETE A's project" 404 DELETE "/projects/$PID_A"
  check "B: GET A's report" 404 GET "/projects/$PID_A/reports/$RNUM_A" ''
  check "B: GET A's notes" 404 GET "/reports/$RID_A/notes" ''
  check "B: PATCH A's note" 404 PATCH "/notes/$NID_A" '{"body":"hacked"}'
  check "B: DELETE A's note" 404 DELETE "/notes/$NID_A"
  check "B: finalize A's report" 404 POST "/projects/$PID_A/reports/$RNUM_A/finalize" ''
  check "B: generate A's report" 404 POST "/projects/$PID_A/reports/$RNUM_A/generate" '{}'
  check "B: GET A's members" 404 GET "/projects/$PID_A/members" ''
else
  echo "  ⚠️  user B unavailable (PHONE2 not in TEST_ACCOUNT_PHONES) — skipping cross-user checks"
  TOKEN_B=""
fi

# ══════════════════════════════════════════════════════════════════════
# SECTION E: Permission escalation (member with wrong role)
# ══════════════════════════════════════════════════════════════════════

echo ""
echo "── E. Permission escalation (viewer doing owner ops) ──"

if [[ "$HAS_USER_B" == "true" ]]; then
  # User A adds B as viewer
  TOKEN="$TOKEN_A"
  req POST "/projects/$PID_A/members" \
    "{\"phone\":\"$PHONE2\",\"role\":\"viewer\"}" >/dev/null
  echo "  B added as viewer to A's project"

  # User B tries owner operations
  TOKEN="$TOKEN_B"

  # NOTE: PATCH project by viewer returns 200 — the API does not enforce
  # owner-only on PATCH /projects/:id. This may be intentional (editors/viewers
  # can rename) or a bug. Documenting actual behavior here.
  check "viewer: PATCH project (allowed — no role gate)" 200 PATCH "/projects/$PID_A" '{"name":"viewer rename"}'
  check "viewer: DELETE project (owner-only)" 404 DELETE "/projects/$PID_A"
  check "viewer: add member" 403 POST "/projects/$PID_A/members" \
    '{"phone":"+15550199003","role":"editor"}'
  check "viewer: remove member" 403 DELETE "/projects/$PID_A/members/usr_000000000000"

  # Viewer CAN read (should get 200)
  check "viewer: GET project (allowed)" 200 GET "/projects/$PID_A" ''
  check "viewer: GET reports (allowed)" 200 GET "/projects/$PID_A/reports" ''
else
  echo "  ⚠️  skipping (no user B available)"
fi

# ══════════════════════════════════════════════════════════════════════
# SECTION F: Invalid payloads & boundary values
# ══════════════════════════════════════════════════════════════════════

echo ""
echo "── F. Invalid payloads ──"
TOKEN="$TOKEN_A"

check "POST project: empty name" 400 POST /projects '{"name":""}'
check "POST project: name too long" 400 POST /projects \
  "{\"name\":\"$(printf 'x%.0s' {1..300})\"}"
check "POST project: extra unknown field (stripped, succeeds)" 201 POST /projects \
  '{"name":"StressExtraFieldTest","hackerField":"should be stripped"}'
# Clean up the extra project
EXTRA_PID=$(req GET /projects '' | j '.items[] | select(.name=="StressExtraFieldTest") | .id' | head -1)
if [[ -n "$EXTRA_PID" && "$EXTRA_PID" != "null" ]]; then
  req DELETE "/projects/$EXTRA_PID" >/dev/null
fi

check "POST report: invalid date" 400 POST "/projects/$PID_A/reports" \
  '{"visitDate":"not-a-date"}'

check "POST note: missing kind" 400 POST "/reports/$RID_A/notes" \
  '{"body":"no kind"}'
check "POST note: voice without fileId (allowed, no attachment)" 201 POST "/reports/$RID_A/notes" \
  '{"kind":"voice"}'
check "POST note: image without fileId (allowed, no attachment)" 201 POST "/reports/$RID_A/notes" \
  '{"kind":"image"}'

check "PATCH /me: invalid field type" 400 PATCH /me \
  '{"displayName":12345}'

check "POST presign: zero bytes" 400 POST /files/presign \
  '{"scope":"scratch","kind":"image","contentType":"image/png","sizeBytes":0}'
check "POST presign: negative bytes" 400 POST /files/presign \
  '{"scope":"scratch","kind":"image","contentType":"image/png","sizeBytes":-1}'
check "POST presign: invalid kind" 400 POST /files/presign \
  '{"scope":"scratch","kind":"malware","contentType":"image/png","sizeBytes":100}'

# ══════════════════════════════════════════════════════════════════════
# SECTION G: Double operations & state violations
# ══════════════════════════════════════════════════════════════════════

echo ""
echo "── G. Double operations & state violations ──"

# Set a body and finalize
req PATCH "/projects/$PID_A/reports/$RNUM_A" '{
  "body":{"meta":{"title":"X","summary":null,"visitDate":"2026-05-20T09:00:00Z","tags":[]},"weather":null,"workers":[],"materials":[],"issues":[],"nextSteps":[],"summarySections":[{"title":"X","body":"Y"}]}
}' >/dev/null
echo "  body set"
req POST "/projects/$PID_A/reports/$RNUM_A/finalize" '' >/dev/null
echo "  report finalized"

check "PATCH finalized report" 409 PATCH "/projects/$PID_A/reports/$RNUM_A" \
  '{"body":{"meta":{"title":"X","summary":null,"visitDate":null,"tags":[]},"weather":null,"workers":[],"materials":[],"issues":[],"nextSteps":[],"summarySections":[{"title":"hacked","body":"x"}]}}'
check "double finalize (idempotent)" 200 POST "/projects/$PID_A/reports/$RNUM_A/finalize" ''

# Unfinalize, then test double unfinalize
req POST "/projects/$PID_A/reports/$RNUM_A/unfinalize" '' >/dev/null
echo "  unfinalized"
check "double unfinalize (conflict)" 409 POST "/projects/$PID_A/reports/$RNUM_A/unfinalize" ''

# Delete the report, then try operations on deleted resource
req DELETE "/projects/$PID_A/reports/$RNUM_A" >/dev/null
REPORT_DELETED=true
echo "  report deleted"
check "finalize deleted report" 404 POST "/projects/$PID_A/reports/$RNUM_A/finalize" ''

# Delete a note, then try to delete again (note may already be gone if report cascade-deleted)
set +e
req DELETE "/notes/$NID_A" >/dev/null 2>&1
set -e
check "double-delete note" 404 DELETE "/notes/$NID_A"

# ══════════════════════════════════════════════════════════════════════
# SECTION H: Non-existent resources
# ══════════════════════════════════════════════════════════════════════

echo ""
echo "── H. Non-existent resources ──"

check "GET ghost project" 404 GET /projects/prj_000000000000 ''
check "PATCH ghost project" 404 PATCH /projects/prj_000000000000 '{"name":"x"}'
check "DELETE ghost project" 404 DELETE /projects/prj_000000000000
check "GET ghost report" 404 GET "/projects/$PID_A/reports/9999" ''
check "GET ghost note" 404 PATCH /notes/not_000000000000 '{"body":"x"}'
check "GET ghost file URL" 404 GET /files/fil_000000000000/url ''
check "GET ghost resolver /p/" 404 GET /p/prj_000000000000 ''
check "GET ghost resolver /r/" 404 GET /r/rpt_000000000000 ''

# ══════════════════════════════════════════════════════════════════════
# SECTION I: Method not allowed & bad routes
# ══════════════════════════════════════════════════════════════════════

echo ""
echo "── I. Method/route errors ──"

check "PUT /projects (not found)" 404 PUT /projects '{"name":"x"}'
check "PATCH /healthz (not found)" 404 PATCH /healthz ''
check "GET /nonexistent" 404 GET /nonexistent ''

# ══════════════════════════════════════════════════════════════════════
# SECTION J: Rate limiting (optional — only if not in prod)
# ══════════════════════════════════════════════════════════════════════

if [[ "$BASE" != *"harpa-pro-api.fly.dev"* ]]; then
  echo ""
  echo "── J. Rate-limit probe (non-production only) ──"
  TOKEN=""
  RATE_LIMITED=false
  for i in $(seq 1 25); do
    response=$(raw POST /auth/password/verify \
      "{\"phone\":\"$PHONE\",\"password\":\"wrong$i\"}")
    status=$(echo "$response" | tail -1)
    if [[ "$status" == "429" ]]; then
      echo "  ✓ rate limited after $i attempts (429)"
      RATE_LIMITED=true
      ((PASS++)) || true
      break
    fi
  done
  if [[ "$RATE_LIMITED" == "false" ]]; then
    echo "  ⚠️  not rate limited after 25 attempts (may be disabled locally)"
  fi
fi

# ══════════════════════════════════════════════════════════════════════
# SECTION K: Cleanup
# ══════════════════════════════════════════════════════════════════════

echo ""
echo "── cleanup ──"
TOKEN="$TOKEN_A"

# Remove B as member first (only if B was added)
if [[ "$HAS_USER_B" == "true" ]]; then
  MEMBER_B_UID=$(req GET "/projects/$PID_A/members" '' | j '.items[] | select(.role=="viewer") | .userId')
  if [[ -n "$MEMBER_B_UID" ]]; then
    req DELETE "/projects/$PID_A/members/$MEMBER_B_UID" >/dev/null
  fi
fi

if [[ "${REPORT_DELETED:-}" != "true" ]]; then
  req DELETE "/projects/$PID_A/reports/$RNUM_A" >/dev/null
fi
req DELETE "/projects/$PID_A" >/dev/null
echo "  ✓ A's resources cleaned"

req POST /auth/logout '' >/dev/null
if [[ "$HAS_USER_B" == "true" && -n "$TOKEN_B" ]]; then
  TOKEN="$TOKEN_B"
  req POST /auth/logout '' >/dev/null
fi
echo "  ✓ logged out"

# ══════════════════════════════════════════════════════════════════════
# Results
# ══════════════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo " JOURNEY-STRESS results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════════════════════"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
echo "✓ all checks passed"
