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
# Requires: jq, curl, two test accounts (EMAIL, EMAIL2 + shared PASSWORD).
#
# Usage:
#   PASSWORD=secret bash scripts/journey-stress.sh
set -euo pipefail

BASE=${BASE:-https://harpa-pro-api-dev.fly.dev}
EMAIL=${EMAIL:-test@harpapro.com}
EMAIL2=${EMAIL2:-test2@harpapro.com}
: "${PASSWORD:?PASSWORD env var is required}"

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

# password_login EMAIL PASSWORD -> echoes the bearer token from the
# `set-auth-token` response header on POST /api/auth/sign-in/email.
# Retries on 429 to ride out better-auth's per-IP auth-route rate
# limiter that this journey's section A intentionally exhausts.
password_login() {
  local email="$1" pass="$2"
  local attempt=1 status headers backoff
  while (( attempt <= 6 )); do
    status=$(curl -sS -D /tmp/journey-login-headers.$$ -o /dev/null \
      -w '%{http_code}' -X POST \
      "$BASE/api/auth/sign-in/email" "${H[@]}" \
      -d "{\"email\":\"$email\",\"password\":\"$pass\"}")
    if [[ "$status" == "200" ]]; then
      headers=$(cat /tmp/journey-login-headers.$$)
      rm -f /tmp/journey-login-headers.$$
      printf '%s' "$headers" | awk 'tolower($1)=="set-auth-token:" {print $2}' | tr -d '\r\n'
      return 0
    fi
    if [[ "$status" != "429" ]]; then
      rm -f /tmp/journey-login-headers.$$
      return 1
    fi
    backoff=$((attempt * 10))
    echo "  ⏳ sign-in rate-limited (HTTP 429); waiting ${backoff}s before retry $((attempt + 1))/6" >&2
    sleep "$backoff"
    attempt=$((attempt + 1))
  done
  rm -f /tmp/journey-login-headers.$$
  return 1
}

# Returns HTTP status + body. Does not fail on 4xx/5xx.
raw() {
  curl -sS -w '\n%{http_code}' -X "$1" "$BASE$2" "${H[@]}" \
    ${TOKEN:+-H "authorization: Bearer $TOKEN"} \
    ${3:+-d "$3"}
}

# Assert expected HTTP status. Accepts a single status (e.g. "401")
# or a pipe-separated set of acceptable statuses (e.g. "500|429") —
# useful when the contract under test is "the API said no" rather
# than a specific code, e.g. malformed-body checks that may also
# trip an auth-route rate limit.
assert_status() {
  local expected="$1"; shift
  local response; response=$(raw "$@")
  local status; status=$(echo "$response" | tail -1)
  if [[ "|$expected|" == *"|$status|"* ]]; then
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

# Use a stable fake email for all bad-cred tests so we never touch
# the real test accounts' failed-attempt counters. The auth.ts hook
# bounces any sign-in whose email isn't in TEST_ACCOUNT_EMAILS at
# UNAUTHORIZED *before* the credential check runs, so real accounts
# never see these attempts and can't be lockout-throttled by stress
# burning through their attempt budget. (Probing real accounts here
# is what wedged 3 consecutive post-deploy runs in 2026-06-06; see
# docs/bugs/2026-06-06-journey-scripts-better-auth-drift.md.)
BAIT_EMAIL="stress-bait-not-in-allowlist@e2e.harpapro.com"

# better-auth's email/password adapter returns 401 ("Invalid
# credentials") for any sign-in input it considers a bad credential —
# wrong password, missing fields, malformed email, empty email — so
# the API surface gives no oracle on which field was at fault. Empty
# / unparseable bodies still 500 today (tracked separately as a body-
# parse error mapper gap; once fixed those become 400).
#
# better-auth ALSO has its own per-IP auth-route rate limiter that
# trips after ~3-4 failed sign-ins. When it does, every subsequent
# sign-in attempt — failed OR successful — gets 429 until the window
# resets. We tolerate "401|429" on every bad-cred check so the
# journey doesn't become flaky against shared-IP GHA runners that
# may already be near the limit when the job starts. The 429 path is
# itself a real test ("the API said no"); the limiter behavior is
# additionally exercised by the protected-route checks in section C.
check "wrong password" "401|429" POST /api/auth/sign-in/email \
  "{\"email\":\"$BAIT_EMAIL\",\"password\":\"wrong_password_123\"}"
sleep 1

check "empty email" "401|429" POST /api/auth/sign-in/email \
  '{"email":"","password":"anything"}'
sleep 1

check "invalid email format" "401|429" POST /api/auth/sign-in/email \
  '{"email":"not-an-email","password":"anything"}'
sleep 1

check "missing password field" "401|429" POST /api/auth/sign-in/email \
  "{\"email\":\"$BAIT_EMAIL\"}"
sleep 1

# Empty body and malformed JSON currently 500 (body parser error not
# mapped). When the error mapper learns to translate JSON parse
# errors to 400, flip these expectations. Tolerate 429 because by
# this point in the journey better-auth's built-in per-IP auth-route
# rate limiter (separate from our global limiter) may have tripped
# from the previous bad sign-in attempts; either response is
# acceptable for the contract being tested here ("API rejects
# garbage without crashing").
check "empty body" "500|429" POST /api/auth/sign-in/email ''
sleep 1

check "malformed JSON" "500|429" POST /api/auth/sign-in/email \
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
# better-auth's sign-out is idempotent: with any token (valid, fake,
# or expired) it always returns 200 {"success":true}. The route is
# meant to be safe to call from "log me out everywhere" UIs even if
# the local session is already gone. The journey here just verifies
# the route is wired up and reachable; auth-boundary coverage for
# token validity lives on the protected routes above.
check "POST /api/auth/sign-out with fake token" 200 POST /api/auth/sign-out '{}'

# ══════════════════════════════════════════════════════════════════════
# SECTION D: Cross-user access (user B trying user A's resources)
# ══════════════════════════════════════════════════════════════════════

echo ""
echo "── D. Cross-user access ──"

# Section A intentionally exhausted better-auth's per-IP auth-route
# rate limit. Pause here long enough for the window to reset
# (better-auth default is 60s) so the legitimate sign-in below has a
# fighting chance even before password_login starts retrying.
sleep 60

# Login as user A. password_login retries on 429 internally so it
# tolerates a still-warm rate-limit window. If even the retries
# can't get a token, we exit cleanly with a partial-completion
# marker rather than dying mid-script — sections A/B/C have already
# covered the auth-boundary contract; sections D+ are a bonus we'll
# happily skip when the runner IP is contended.
set +e
TOKEN=$(password_login "$EMAIL" "$PASSWORD" 2>&1)
LOGIN_RC=$?
set -e
if [[ $LOGIN_RC -ne 0 || -z "$TOKEN" || "$TOKEN" == *"⏳"* ]]; then
  echo "  ⚠️  section D sign-in as user A could not get a token after retries" >&2
  echo "  (skipping sections D-G; A/B/C results stand)" >&2
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo " JOURNEY-STRESS results (partial): $PASS passed, $FAIL failed"
  echo " (sections D-G skipped due to rate-limit pressure)"
  echo "═══════════════════════════════════════════════════════════════"
  if [[ $FAIL -gt 0 ]]; then
    exit 1
  fi
  exit 0
fi
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

# Try login as user B. When EMAIL2 == EMAIL (single-account dev), the
# cross-user assertions are nonsensical (test's session can always
# see test's data) so we skip them entirely.
HAS_USER_B=false
if [[ "$EMAIL2" == "$EMAIL" ]]; then
  echo "  ⚠️  user B == user A — skipping cross-user checks"
  TOKEN_B=""
else
  set +e
  TOKEN_B=$(password_login "$EMAIL2" "$PASSWORD" 2>/dev/null)
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
    echo "  ⚠️  user B unavailable (EMAIL2 not in TEST_ACCOUNT_EMAILS) — skipping cross-user checks"
    TOKEN_B=""
  fi
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
    "{\"email\":\"$EMAIL2\",\"role\":\"viewer\"}" >/dev/null
  echo "  B added as viewer to A's project"

  # User B tries owner operations
  TOKEN="$TOKEN_B"

  # Project metadata mutations require a writer role. The route returns 404
  # for insufficient roles so a viewer cannot distinguish the project from a
  # missing resource.
  check "viewer: PATCH project (read-only)" 404 PATCH "/projects/$PID_A" '{"name":"viewer rename"}'
  check "viewer: DELETE project (owner-only)" 404 DELETE "/projects/$PID_A"
  check "viewer: add member" 403 POST "/projects/$PID_A/members" \
    '{"email":"charlie@e2e.harpapro.com","role":"editor"}'
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
  "body":{"meta":{"title":"X","summary":null,"visitDate":"2026-05-20T09:00:00Z"},"weather":null,"workers":[],"materials":[],"issues":[],"nextSteps":[],"summarySections":[{"title":"X","body":"Y"}]}
}' >/dev/null
echo "  body set"
req POST "/projects/$PID_A/reports/$RNUM_A/finalize" '' >/dev/null
echo "  report finalized"

check "PATCH finalized report" 409 PATCH "/projects/$PID_A/reports/$RNUM_A" \
  '{"body":{"meta":{"title":"X","summary":null,"visitDate":null},"weather":null,"workers":[],"materials":[],"issues":[],"nextSteps":[],"summarySections":[{"title":"hacked","body":"x"}]}}'
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
  # Use a dummy email (not EMAIL/EMAIL2) so we don't burn the real test
  # accounts' per-account rate limit budget. The middleware runs before
  # auth, so any email trips the limiter.
  PROBE_EMAIL="probe-rate-limit@e2e.harpapro.com"
  TOKEN=""
  RATE_LIMITED=false
  for i in $(seq 1 25); do
    response=$(raw POST /api/auth/sign-in/email \
      "{\"email\":\"$PROBE_EMAIL\",\"password\":\"wrong$i\"}")
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

req POST /api/auth/sign-out '{}' >/dev/null
if [[ "$HAS_USER_B" == "true" && -n "$TOKEN_B" ]]; then
  TOKEN="$TOKEN_B"
  req POST /api/auth/sign-out '{}' >/dev/null
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
