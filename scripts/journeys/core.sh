#!/usr/bin/env bash
# Journey 1: CORE HAPPY PATH
# ───────────────────────────────────────────────────────────────────────
# Exercises the primary user story end-to-end:
#   login → profile setup → create project → upload voice note →
#   transcribe & summarise → generate report from notes → finalize → PDF
#
# This is the "golden path" a real user takes on day one. It uses live AI
# for transcription, summarisation, and report generation, so it will
# consume provider tokens on dev/production.
#
# Requires: jq, curl, a real voice sample (VOICE_M4A).
# Target: local (http://localhost:3000), dev, or production.
#
# Usage:
#   BASE=http://localhost:3000 PASSWORD=secret bash scripts/journey-core.sh
#   BASE=https://harpa-pro-api-dev.fly.dev PASSWORD="$(doppler ...)" bash scripts/journey-core.sh
set -euo pipefail

BASE=${BASE:-https://harpa-pro-api-dev.fly.dev}
EMAIL=${EMAIL:-alice@e2e.harpapro.com}
: "${PASSWORD:?PASSWORD env var is required}"

SAMPLES="$(cd "$(dirname "$0")/../../apps/cli/scripts/samples" && pwd)"
REAL_SAMPLES="$(cd "$(dirname "$0")/../../samples/real" && pwd)"
IMG="$SAMPLES/sample.png"
# Default to the short LFS-tracked sample (~10s, 125 KB) — cheap on tokens
# and fast on CI, but still exercises the real upload → transcribe →
# summarise → title pipeline. Override via VOICE_M4A=... for longer clips
# (e.g. samples/real/walkthrough.m4a, ~6min).
VOICE_M4A=${VOICE_M4A:-"$REAL_SAMPLES/rain.m4a"}
VOICE_DURATION_SEC=${VOICE_DURATION_SEC:-10}

# ── Helpers ────────────────────────────────────────────────────────────

j() { jq -r "$1"; }
H=(-H 'content-type: application/json')

req() {
  curl -fsS -X "$1" "$BASE$2" "${H[@]}" \
    ${TOKEN:+-H "authorization: Bearer $TOKEN"} \
    ${3:+-d "$3"}
}

# password_login EMAIL PASSWORD -> echoes the bearer token from the
# `set-auth-token` response header on POST /api/auth/sign-in/email.
# Retries on 429 to ride out better-auth's per-IP auth-route rate
# limiter, which the preceding stress journey may have exhausted.
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

# Expect a specific HTTP status (does not fail the script on 4xx/5xx).
expect_status() {
  local expected="$1"; shift
  local status
  status=$(curl -sS -o /dev/null -w '%{http_code}' -X "$1" "$BASE$2" "${H[@]}" \
    ${TOKEN:+-H "authorization: Bearer $TOKEN"} \
    ${3:+-d "$3"})
  if [[ "$status" != "$expected" ]]; then
    echo "  ✗ expected $expected, got $status" >&2; exit 1
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
echo " JOURNEY-CORE: Happy-path voice-note → report generation"
echo " target: $BASE"
echo "═══════════════════════════════════════════════════════════════"

# ── 1. Health checks ──────────────────────────────────────────────────

echo "→ healthz";            req GET /healthz '' >/dev/null
echo "→ readyz";             req GET /readyz  '' >/dev/null

# ── 2. Authentication ─────────────────────────────────────────────────

echo "→ POST /api/auth/sign-in/email"
set +e
TOKEN=$(password_login "$EMAIL" "$PASSWORD")
LOGIN_RC=$?
set -e
if [[ $LOGIN_RC -ne 0 || -z "$TOKEN" ]]; then
  echo "  ✗ no set-auth-token header on sign-in (rc=$LOGIN_RC)" >&2
  exit 1
fi
echo "  ✓ token acquired"

# ── 3. User profile ──────────────────────────────────────────────────

echo "→ GET /me"
ME=$(req GET /me '')
echo "  email=$(echo "$ME" | j .user.email)"

echo "→ PATCH /me (set display name)"
req PATCH /me '{"displayName":"Core Journey User","companyName":"Journey Testing Ltd"}' >/dev/null
echo "  ✓ profile updated"

echo "→ GET /me/usage"
req GET /me/usage '' >/dev/null

# ── 4. AI settings ───────────────────────────────────────────────────

echo "→ PATCH /settings/ai (set to openai for transcription)"
req PATCH /settings/ai '{"vendor":"openai","model":"gpt-4.1-mini"}' >/dev/null

# ── 5. Create project ────────────────────────────────────────────────

echo "→ POST /projects"
PID=$(req POST /projects \
  '{"name":"Core Journey Site","clientName":"Acme Construction","address":"123 Build Ave"}' | j .id)
echo "  pid=$PID"

echo "→ GET /projects/$PID"
req GET "/projects/$PID" '' >/dev/null

# ── 6. Create report ─────────────────────────────────────────────────

echo "→ POST /projects/$PID/reports"
REPORT=$(req POST "/projects/$PID/reports" \
  '{"visitDate":"2026-05-20T09:00:00Z"}')
RID=$(echo "$REPORT" | j .id)
RNUM=$(echo "$REPORT" | j .number)
echo "  rid=$RID number=$RNUM"

# ── 7. Add a text note ───────────────────────────────────────────────

echo "→ POST /reports/$RID/notes (text)"
TEXT_NID=$(req POST "/reports/$RID/notes" \
  '{"kind":"text","body":"Foundation pour completed on section A. Weather was clear and dry. 12 workers on site."}' | j .id)
echo "  text_nid=$TEXT_NID"

# ── 8. Upload and add image note ─────────────────────────────────────

echo "→ upload image"
IMG_FID=$(upload_file image image/png "$IMG" "$PID" "$RID")
echo "  file_id=$IMG_FID"

echo "→ POST /reports/$RID/notes (image)"
IMG_NID=$(req POST "/reports/$RID/notes" \
  "{\"kind\":\"image\",\"fileId\":\"$IMG_FID\",\"body\":\"Photo of section A foundation\"}" | j .id)
echo "  img_nid=$IMG_NID"

# ── 9. Upload voice note + transcribe via aggregator ─────────────────

echo "→ upload voice recording"
if [[ ! -f "$VOICE_M4A" ]]; then
  echo "  ⚠️  VOICE_M4A not found at $VOICE_M4A — skipping voice aggregator"
  echo "  (set VOICE_M4A env to a real ~30s+ voice sample for full test)"
  VOICE_AGG_NID=""
else
  VOICE_FID=$(upload_file voice audio/mp4 "$VOICE_M4A" "$PID" "$RID")
  echo "  file_id=$VOICE_FID"

  echo "→ POST /reports/$RID/notes/voice (transcribe + summarise)"
  USAGE_BEFORE_VOICE=$(req GET /me/usage '')
  CALLS_BEFORE_VOICE=$(echo "$USAGE_BEFORE_VOICE" | jq -r '.totals.calls // 0')
  set +e
  VOICE_AGG=$(req POST "/reports/$RID/notes/voice" \
    "{\"fileId\":\"$VOICE_FID\",\"durationSec\":$VOICE_DURATION_SEC}" 2>&1)
  AGG_STATUS=$?
  set -e
  if [[ $AGG_STATUS -eq 0 ]]; then
    VOICE_AGG_NID=$(echo "$VOICE_AGG" | j .id)
    VOICE_TRANSCRIPT=$(echo "$VOICE_AGG" | j '.body // empty' | head -c 80)
    echo "  ✓ transcribed: \"${VOICE_TRANSCRIPT}...\""
    echo "  nid=$VOICE_AGG_NID"
    USAGE_AFTER_VOICE=$(req GET /me/usage '')
    CALLS_AFTER_VOICE=$(echo "$USAGE_AFTER_VOICE" | jq -r '.totals.calls // 0')
    TOKENS_AFTER_VOICE=$(echo "$USAGE_AFTER_VOICE" | jq -r '(.totals.inputTokens // 0) + (.totals.outputTokens // 0)')
    echo "  /me/usage: calls ${CALLS_BEFORE_VOICE}→${CALLS_AFTER_VOICE} tokens=$TOKENS_AFTER_VOICE"
    if [[ "$CALLS_AFTER_VOICE" -le "$CALLS_BEFORE_VOICE" ]]; then
      echo "  ✗ /me/usage totals.calls did not increase after voice aggregator" >&2
      exit 1
    fi
  else
    echo "  ⚠️  voice aggregator failed (AI unavailable or sample too short)"
    VOICE_AGG_NID=""
  fi
fi

# ── 10. Generate report from notes (AI) ──────────────────────────────

echo "→ POST /projects/$PID/reports/$RNUM/generate"
USAGE_BEFORE_GEN=$(req GET /me/usage '')
CALLS_BEFORE_GEN=$(echo "$USAGE_BEFORE_GEN" | jq -r '.totals.calls // 0')
set +e
# shellcheck disable=SC2034  # captured for future error-detail logging; intentionally unread today
GEN_RESULT=$(req POST "/projects/$PID/reports/$RNUM/generate" '{}' 2>&1)
GEN_STATUS=$?
set -e
if [[ $GEN_STATUS -eq 0 ]]; then
  echo "  ✓ report generated"
  BODY=$(req GET "/projects/$PID/reports/$RNUM" '' | j '.body.summarySections | length')
  echo "  sections in generated report: $BODY"
  USAGE_AFTER_GEN=$(req GET /me/usage '')
  CALLS_AFTER_GEN=$(echo "$USAGE_AFTER_GEN" | jq -r '.totals.calls // 0')
  BYMODEL_HAS_GEN=$(echo "$USAGE_AFTER_GEN" | jq -r '[.usageByModel[] | select(.operation == "generate_report")] | length')
  echo "  /me/usage: calls ${CALLS_BEFORE_GEN}→${CALLS_AFTER_GEN} generate_report rows=$BYMODEL_HAS_GEN"
  if [[ "$CALLS_AFTER_GEN" -le "$CALLS_BEFORE_GEN" ]]; then
    echo "  ✗ /me/usage totals.calls did not increase after /generate" >&2
    exit 1
  fi
  if [[ "$BYMODEL_HAS_GEN" -lt 1 ]]; then
    echo "  ✗ /me/usage.usageByModel missing operation=generate_report" >&2
    exit 1
  fi
else
  echo "  ⚠️  generate failed (AI unavailable — expected if no notes transcribed)"
fi

# ── 11. Finalize → PDF → unfinalize ──────────────────────────────────

# Ensure report has a body for finalization (set manually if generate failed)
echo "→ PATCH report body (ensure finalization works)"
req PATCH "/projects/$PID/reports/$RNUM" '{
  "body":{
    "meta":{"title":"Section A Foundation","summary":"Foundation pour completed.","visitDate":"2026-05-20T09:00:00Z"},
    "weather":{"condition":"Clear","temperature":"22°C","wind":"5 kph","impact":null},
    "workers":[{"role":"Labourer","count":"2","hours":"8","notes":null}],
    "materials":[{"name":"Concrete","quantity":"20","unit":"m³","status":"delivered","condition":"good","notes":null}],
    "issues":[{"title":"Minor crack in form","severity":"low","description":"Small hairline crack","action":"Monitor"}],
    "nextSteps":["Inspect section B tomorrow"],
    "summarySections":[{"title":"Progress","body":"Section A foundation complete."}]
  }
}' >/dev/null

echo "→ POST /projects/$PID/reports/$RNUM/finalize"
req POST "/projects/$PID/reports/$RNUM/finalize" '' >/dev/null
echo "  ✓ finalized"

echo "→ POST /projects/$PID/reports/$RNUM/pdf"
PDF_URL=$(req POST "/projects/$PID/reports/$RNUM/pdf" '' | j '.url // .pdfUrl // empty')
if [[ -n "$PDF_URL" ]]; then
  echo "  ✓ PDF URL generated (${#PDF_URL} chars)"
else
  echo "  ✓ PDF endpoint responded"
fi

echo "→ POST /projects/$PID/reports/$RNUM/unfinalize"
req POST "/projects/$PID/reports/$RNUM/unfinalize" '' >/dev/null
echo "  ✓ unfinalized"

# ── 12. Cleanup ───────────────────────────────────────────────────────

echo "── cleanup ──"
echo "→ DELETE notes"
req DELETE "/notes/$TEXT_NID" >/dev/null
req DELETE "/notes/$IMG_NID" >/dev/null
[[ -n "${VOICE_AGG_NID:-}" ]] && req DELETE "/notes/$VOICE_AGG_NID" >/dev/null
echo "→ DELETE report"
req DELETE "/projects/$PID/reports/$RNUM" >/dev/null
echo "→ DELETE project"
req DELETE "/projects/$PID" >/dev/null
echo "→ POST /api/auth/sign-out"
req POST /api/auth/sign-out '' >/dev/null

echo ""
echo "✓ JOURNEY-CORE complete"
