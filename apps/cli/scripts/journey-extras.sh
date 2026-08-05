#!/usr/bin/env bash
# Focused journey for coverage gaps not in ./journey.sh.
#
# Backend-first track (be-1/be-2/be-3):
#   - POST /projects/{project}/reports/{number}/unfinalize (be-1)
#   - LLM token accounting on every chat/transcribe/generate call (be-2)
#   - GET /me/usage with tokens + byModel breakdown (be-3)
#
# Additional coverage gaps:
#   - REAL file uploads (presign → PUT to MinIO → register → signed GET
#     → byte-equal round-trip) for image / voice / pdf / document.
#     The main journey only mints presign URLs and never PUTs bytes.
#   - GET /p/{project} and GET /r/{report} deep-link resolvers
#   - finalize lock-down (update blocked while finalized)
#   - cross-tenant access denial (non-member sees 403/404)
#
# Real uploads require docker-compose with MinIO running (added in the
# same change as this script). The API container is configured with
# R2_FIXTURE_MODE=live + R2_ENDPOINT=http://minio:9000 +
# R2_PUBLIC_ENDPOINT=http://localhost:9000 so the host-side CLI can
# PUT to localhost:9000 and the signature still validates.
#
# Prereq:
#   docker compose up -d        # brings up pg + minio + minio-init + api
#   pnpm --filter @harpa/cli build
#
# Run:
#   HARPA_TOKEN=<owner-token> HARPA_TOKEN_B=<outsider-token> \
#     ./apps/cli/scripts/journey-extras.sh
#
# Or sign in with email OTP (codes are prompted after each send):
#   EMAIL=owner@example.com EMAIL_B=outsider@example.com \
#     ./apps/cli/scripts/journey-extras.sh
#   # OTP_CODE / OTP_CODE_B may be set to avoid interactive prompts.
set -euo pipefail

export HARPA_API_URL="${HARPA_API_URL:-http://localhost:8787}"
CLI="node $(cd "$(dirname "$0")/.." && pwd)/dist/index.js"

# Sample fixtures live in the repo (apps/cli/scripts/samples). They are
# tiny, license-free, hand-crafted bytes — see samples/README.md.
SAMPLES="$(cd "$(dirname "$0")/samples" && pwd)"
IMG="$SAMPLES/sample.png"
WAV="$SAMPLES/sample.wav"
PDF="$SAMPLES/sample.pdf"
TXT="$SAMPLES/sample.txt"
WORK=$(mktemp -d -t harpa-journey-XXXX)
ROUNDTRIP="$WORK/roundtrip"
# fileKeys are recorded so cleanup can mc-rm them from the bucket.
KEYS_FILE="$WORK/keys"
: > "$KEYS_FILE"

step() { echo; echo "▶ $*"; }
fail() { echo "✗ $*" >&2; exit 1; }
sign_in_with_email_otp() {
  local email="$1" code="${2:-}"
  $CLI auth otp start "$email" >&2
  if [[ -z "$code" ]]; then
    [[ -t 0 ]] || fail "an OTP code is required when stdin is not interactive"
    read -r -s -p "OTP for $email: " code
    echo >&2
  fi
  $CLI auth otp verify "$email" "$code" --raw
}
cleanup() {
  # Best-effort: remove uploaded objects from MinIO via the mc image.
  # Runs even on failure so the bucket doesn't accumulate orphans.
  if [[ -s "$KEYS_FILE" ]] && docker compose ps --services 2>/dev/null | grep -q minio; then
    while IFS= read -r key; do
      docker run --rm --network harpa-pro-opus_default minio/mc:latest \
        /bin/sh -c "mc alias set local http://minio:9000 minio minio-dev-secret >/dev/null && \
                    mc rm 'local/harpa-pro/$key'" >/dev/null 2>&1 || true
    done < "$KEYS_FILE"
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

# ─── sample fixtures (checked in under samples/) ───────────────────
for f in "$IMG" "$WAV" "$PDF" "$TXT"; do
  test -f "$f" || fail "missing sample fixture: $f"
done
echo "using samples from $SAMPLES:"
ls -l "$IMG" "$WAV" "$PDF" "$TXT"

# ─── auth ──────────────────────────────────────────────────────────
TOKEN="${HARPA_TOKEN:-}"
TOKEN_FROM_OTP=0
if [[ -n "$TOKEN" ]]; then
  step "auth — reuse HARPA_TOKEN"
else
  : "${EMAIL:?EMAIL is required when HARPA_TOKEN is not set}"
  step "auth email OTP — start + verify"
  TOKEN=$(sign_in_with_email_otp "$EMAIL" "${OTP_CODE:-}")
  TOKEN_FROM_OTP=1
fi
test -n "$TOKEN" || fail "authentication returned an empty token"
echo "owner token: ${TOKEN:0:24}…"
export HARPA_TOKEN="$TOKEN"

# ─── baseline usage (before any LLM calls) ────────────────────────
step "me usage (baseline)"
USAGE_BEFORE=$($CLI me usage --json)
CALLS_BEFORE=$(echo "$USAGE_BEFORE" | jq '.totals.calls')
TOK_BEFORE=$(echo "$USAGE_BEFORE" | jq '.totals.inputTokens + .totals.outputTokens + .totals.cachedTokens')
echo "baseline: calls=$CALLS_BEFORE tokens=$TOK_BEFORE"

# ─── setup: one project + one report ──────────────────────────────
step "projects create"
PROJECT_SLUG=$($CLI projects create --name "Token-accounting site" --json | jq -er .id)
echo "project slug: $PROJECT_SLUG"

step "reports create"
REPORT_JSON=$($CLI reports create "$PROJECT_SLUG" --visit-date 2026-05-17 --json)
REPORT_NUMBER=$(echo "$REPORT_JSON" | jq -er .number)
REPORT_ID=$(echo "$REPORT_JSON" | jq -er .id)
echo "report number=$REPORT_NUMBER id=$REPORT_ID"

# ─── REAL uploads: round-trip each file kind through MinIO ────────
# Each step: `files upload` (presign → PUT → register), then
# `files url` + curl GET, then md5/diff the bytes.
upload_and_verify() {
  local label="$1" kind="$2" path="$3" content_type="$4"
  step "files upload ($label, kind=$kind, real bytes via MinIO)"
  local OUT
  OUT=$($CLI files upload --file "$path" --kind "$kind" --content-type "$content_type" --json)
  echo "$OUT" | jq .
  local FID FKEY SIZE
  FID=$(echo "$OUT"  | jq -r .fileId)
  FKEY=$(echo "$OUT" | jq -r .fileKey)
  SIZE=$(echo "$OUT" | jq -r .sizeBytes)
  echo "$FKEY" >> "$KEYS_FILE"
  test "$SIZE" = "$(wc -c <"$path" | tr -d ' ')" \
    || fail "registered sizeBytes ($SIZE) != local file size"

  step "files url ($label) → GET and verify byte-equal round-trip"
  local URL
  URL=$($CLI files url "$FID" --json | jq -r .url)
  curl -fsS "$URL" -o "$ROUNDTRIP"
  diff -q "$path" "$ROUNDTRIP" >/dev/null \
    || fail "$label round-trip bytes differ"
  echo "✓ $label byte-equal ($(wc -c <"$path" | tr -d ' ') bytes)"
  # Export FILE_VOICE for downstream voice transcribe step.
  if [[ "$kind" = "voice" ]]; then FILE_VOICE="$FID"; fi
}
upload_and_verify "image"    image    "$IMG" "image/png"
upload_and_verify "voice"    voice    "$WAV" "audio/wav"
upload_and_verify "pdf"      pdf      "$PDF" "application/pdf"
upload_and_verify "document" document "$TXT" "text/plain"

# ─── be-2: each AI call should record a usage row ─────────────────
step "voice transcribe (records 1 transcribe row)"
$CLI voice transcribe --file-id "$FILE_VOICE" --fixture transcribe.voice-1

step "voice summarize (records 1 chat row, non-zero tokens)"
$CLI voice summarize --transcript "Crew of four poured concrete at 8am." --fixture summarize.voice-1

step "reports generate (records 1 generate_report row)"
$CLI reports generate "$PROJECT_SLUG" "$REPORT_NUMBER" --fixture generate-report.voice-1

# ─── be-3: /me/usage reflects all 3 LLM calls ─────────────────────
step "me usage (after 3 LLM calls)"
USAGE_AFTER=$($CLI me usage --json)
echo "$USAGE_AFTER" | jq '{ totals, usageByModel }'
CALLS_AFTER=$(echo "$USAGE_AFTER" | jq '.totals.calls')
TOK_AFTER=$(echo "$USAGE_AFTER" | jq '.totals.inputTokens + .totals.outputTokens + .totals.cachedTokens')
TOK_INPUT=$(echo "$USAGE_AFTER" | jq '.totals.inputTokens')
TOK_OUTPUT=$(echo "$USAGE_AFTER" | jq '.totals.outputTokens')
TOK_CACHED=$(echo "$USAGE_AFTER" | jq '.totals.cachedTokens')
echo "after: calls=$CALLS_AFTER tokens=$TOK_AFTER (input=$TOK_INPUT output=$TOK_OUTPUT cached=$TOK_CACHED)"

# 3 chokepoint calls: transcribe + chat (summarize) + generate.
test "$CALLS_AFTER" -ge "$((CALLS_BEFORE + 3))" \
  || fail "expected at least 3 new calls, got $((CALLS_AFTER - CALLS_BEFORE))"
# chat + generate carry usage; transcribe (whisper) carries 0 tokens.
test "$TOK_AFTER" -gt "$TOK_BEFORE" \
  || fail "expected token usage to increase from $TOK_BEFORE, got $TOK_AFTER"

step "me usage usageByModel breakdown lists chat + transcribe + generate_report"
OPS=$(echo "$USAGE_AFTER" | jq -r '[.usageByModel[].operation] | unique | sort | join(",")')
echo "operations: $OPS"
echo "$USAGE_AFTER" | jq -e \
  '[.usageByModel[].operation] | contains(["chat", "generate_report", "transcribe"])' \
  >/dev/null || fail "usageByModel is missing an expected operation"

# ─── coverage: deep-link resolvers (/p/{id}, /r/{id}) — no CLI command ─
step "GET /p/{project} resolves to projectId"
RESOLVED_P=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$HARPA_API_URL/p/$PROJECT_SLUG")
echo "$RESOLVED_P" | jq .
test "$(echo "$RESOLVED_P" | jq -r .projectId)" = "$PROJECT_SLUG" \
  || fail "resolver /p/{project} returned wrong projectId"

step "GET /r/{report} resolves to projectId + reportNumber"
RESOLVED_R=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$HARPA_API_URL/r/$REPORT_ID")
echo "$RESOLVED_R" | jq .
test "$(echo "$RESOLVED_R" | jq -r .projectId)" = "$PROJECT_SLUG" || fail "/r resolver wrong projectId"
test "$(echo "$RESOLVED_R" | jq -r .reportNumber)" = "$REPORT_NUMBER" || fail "/r resolver wrong reportNumber"

# ─── be-1: finalize → unfinalize round-trip ───────────────────────
step "reports finalize"
FIN=$($CLI reports finalize "$PROJECT_SLUG" "$REPORT_NUMBER" --json)
test "$(echo "$FIN" | jq -r .report.status)" = "finalized" \
  || fail "expected finalized status"

# ─── coverage: finalize lock-down (update blocked while finalized) ─
step "reports update on finalized → must fail with 409"
if $CLI reports update "$PROJECT_SLUG" "$REPORT_NUMBER" --visit-date 2026-06-01 >/dev/null 2>&1; then
  fail "expected update on finalized report to fail"
fi
echo "✓ update blocked on finalized report"

step "reports unfinalize (flips back to draft)"
UNFIN=$($CLI reports unfinalize "$PROJECT_SLUG" "$REPORT_NUMBER" --json)
test "$(echo "$UNFIN" | jq -r .report.status)" = "draft" \
  || fail "expected draft status after unfinalize"
test "$(echo "$UNFIN" | jq -r .report.finalizedAt)" = "null" \
  || fail "expected finalizedAt cleared after unfinalize"

step "reports unfinalize again → 409 (non-idempotent)"
if $CLI reports unfinalize "$PROJECT_SLUG" "$REPORT_NUMBER" >/dev/null 2>&1; then
  fail "expected unfinalize on draft report to fail with 409"
fi
echo "✓ second unfinalize correctly failed"

# ─── coverage: second user for cross-tenant test ──────────────────
TOKEN_B="${HARPA_TOKEN_B:-}"
TOKEN_B_FROM_OTP=0
if [[ -n "$TOKEN_B" ]]; then
  step "outsider auth — reuse HARPA_TOKEN_B"
else
  : "${EMAIL_B:?EMAIL_B is required when HARPA_TOKEN_B is not set}"
  step "outsider auth email OTP — start + verify"
  TOKEN_B=$(sign_in_with_email_otp "$EMAIL_B" "${OTP_CODE_B:-}")
  TOKEN_B_FROM_OTP=1
fi
test -n "$TOKEN_B" || fail "outsider authentication returned an empty token"
test "$TOKEN_B" != "$TOKEN" || fail "owner and outsider tokens must differ"
echo "outsider token: ${TOKEN_B:0:24}…"

# ─── coverage: cross-tenant 403 — non-member can't see alice's project ─
step "outsider projects get <owner-project> → auth/not-found exit"
if HARPA_TOKEN="$TOKEN_B" $CLI projects get "$PROJECT_SLUG" >/dev/null 2>&1; then
  fail "expected outsider to be denied"
else
  CODE=$?
fi
test "$CODE" = "3" || test "$CODE" = "4" \
  || fail "expected auth/not-found exit 3 or 4, got $CODE"
echo "✓ cross-tenant access denied (exit=$CODE)"

# The member-role update API route has no CLI command and is intentionally
# outside this CLI journey.

# ─── cleanup ──────────────────────────────────────────────────────
step "reports delete"
$CLI reports delete "$PROJECT_SLUG" "$REPORT_NUMBER"

step "projects delete"
$CLI projects delete "$PROJECT_SLUG"

step "auth logout"
if [[ "$TOKEN_FROM_OTP" = "1" ]]; then
  $CLI auth logout
else
  echo "owner logout skipped (caller supplied HARPA_TOKEN)"
fi
if [[ "$TOKEN_B_FROM_OTP" = "1" ]]; then
  HARPA_TOKEN="$TOKEN_B" $CLI auth logout
else
  echo "outsider logout skipped (caller supplied HARPA_TOKEN_B)"
fi

echo
echo "✅ Extras journey complete — real uploads + unfinalize + token accounting verified."
