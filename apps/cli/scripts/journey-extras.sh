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
#   ./apps/cli/scripts/journey-extras.sh
set -euo pipefail

export HARPA_API_URL="${HARPA_API_URL:-http://localhost:8787}"
CLI="node $(cd "$(dirname "$0")/.." && pwd)/dist/index.js"

# Use a unique phone per run so baseline usage is always 0.
SUFFIX=$(printf "%04d" $(( $(date +%s) % 10000 )))
PHONE="+1555123${SUFFIX}"
OTP_CODE="000000"

# Local sample files (generated below — no network, no licence issues).
WORK=$(mktemp -d -t harpa-journey-XXXX)
IMG="$WORK/sample.png"
WAV="$WORK/sample.wav"
PDF="$WORK/sample.pdf"
TXT="$WORK/sample.txt"
ROUNDTRIP="$WORK/roundtrip"
# fileKeys are recorded so cleanup can mc-rm them from the bucket.
KEYS_FILE="$WORK/keys"
: > "$KEYS_FILE"

step() { echo; echo "▶ $*"; }
fail() { echo "✗ $*" >&2; exit 1; }
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

# ─── generate tiny, licence-free sample files ──────────────────────
# 1x1 transparent PNG — 67 bytes, hand-crafted, public domain.
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" \
  | base64 -d > "$IMG"
# 44-byte RIFF/WAVE header + 100ms of silence at 8 kHz mono 8-bit unsigned.
{
  printf 'RIFF'
  printf '\x4c\x03\x00\x00'        # file size - 8 = 0x34C (844 bytes)
  printf 'WAVEfmt '
  printf '\x10\x00\x00\x00'        # fmt chunk size = 16
  printf '\x01\x00\x01\x00'        # PCM, mono
  printf '\x40\x1f\x00\x00'        # 8000 Hz
  printf '\x40\x1f\x00\x00'        # 8000 byte/s
  printf '\x01\x00\x08\x00'        # block align, bits/sample
  printf 'data'
  printf '\x28\x03\x00\x00'        # data size = 808
  head -c 808 /dev/zero | tr '\0' '\x80'  # silence at 8-bit unsigned = 0x80
} > "$WAV"
# Minimal valid PDF (~380 bytes), public domain.
cat > "$PDF" <<'EOF'
%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 144 72]/Contents 4 0 R/Resources<<>>>>endobj
4 0 obj<</Length 21>>stream
BT /F1 12 Tf 10 40 Td ET
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000053 00000 n 
0000000098 00000 n 
0000000178 00000 n 
trailer<</Size 5/Root 1 0 R>>
startxref
242
%%EOF
EOF
# Plain text document.
echo "harpa journey sample document — site inspection notes." > "$TXT"
echo "samples ready in $WORK:"
ls -l "$IMG" "$WAV" "$PDF" "$TXT"

# ─── auth ──────────────────────────────────────────────────────────
step "auth otp start"
$CLI auth otp start "$PHONE"

step "auth otp verify → captures token"
TOKEN=$($CLI auth otp verify "$PHONE" "$OTP_CODE" --json | jq -r .token)
test -n "$TOKEN" && echo "token: ${TOKEN:0:24}…"
export HARPA_TOKEN="$TOKEN"

# ─── baseline usage (before any LLM calls) ────────────────────────
step "me usage (baseline)"
USAGE_BEFORE=$($CLI me usage --json)
CALLS_BEFORE=$(echo "$USAGE_BEFORE" | jq '.totals.calls')
TOK_BEFORE=$(echo "$USAGE_BEFORE"   | jq '.totals.tokens.total')
echo "baseline: calls=$CALLS_BEFORE tokens=$TOK_BEFORE"
test "$CALLS_BEFORE"  = "0" || fail "expected 0 baseline calls, got $CALLS_BEFORE"
test "$TOK_BEFORE"    = "0" || fail "expected 0 baseline tokens, got $TOK_BEFORE"

# ─── setup: one project + one report ──────────────────────────────
step "projects create"
PROJ=$($CLI projects create --name "Token-accounting site" --json | jq -r .id)
echo "project: $PROJ"

step "reports create"
RPT_JSON=$($CLI reports create "$PROJ" --visit-date 2026-05-17 --json)
RPT_NUM=$(echo "$RPT_JSON" | jq -r .number)
RPT_ID=$(echo  "$RPT_JSON" | jq -r .id)
echo "report number=$RPT_NUM id=$RPT_ID"

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
$CLI voice transcribe --file-id "$FILE_VOICE" --fixture transcribe.basic

step "voice summarize (records 1 chat row, non-zero tokens)"
$CLI voice summarize --transcript "Crew of four poured concrete at 8am." --fixture summarize.basic

step "reports generate (records 1 generate_report row)"
$CLI reports generate "$PROJ" "$RPT_NUM" --fixture generate-report.full

# ─── be-3: /me/usage reflects all 3 LLM calls ─────────────────────
step "me usage (after 3 LLM calls)"
USAGE_AFTER=$($CLI me usage --json)
echo "$USAGE_AFTER" | jq '{ totals, byModel }'
CALLS_AFTER=$(echo "$USAGE_AFTER" | jq '.totals.calls')
TOK_AFTER=$(echo "$USAGE_AFTER"   | jq '.totals.tokens.total')
TOK_INPUT=$(echo "$USAGE_AFTER"   | jq '.totals.tokens.input')
TOK_OUTPUT=$(echo "$USAGE_AFTER"  | jq '.totals.tokens.output')
echo "after: calls=$CALLS_AFTER tokens=$TOK_AFTER (input=$TOK_INPUT output=$TOK_OUTPUT)"

# 3 chokepoint calls: transcribe + chat (summarize) + generate.
test "$CALLS_AFTER" -ge 3 || fail "expected >=3 calls, got $CALLS_AFTER"
# chat + generate carry usage; transcribe (whisper) carries 0 tokens.
test "$TOK_AFTER"   -gt 0 || fail "expected non-zero total tokens, got $TOK_AFTER"
test "$TOK_INPUT"   -gt 0 || fail "expected non-zero input tokens"
test "$TOK_OUTPUT"  -gt 0 || fail "expected non-zero output tokens"
test "$TOK_AFTER"   -eq "$((TOK_INPUT + TOK_OUTPUT))" \
  || fail "total ($TOK_AFTER) != input ($TOK_INPUT) + output ($TOK_OUTPUT)"

step "me usage byModel breakdown lists chat + transcribe + generate_report"
OPS=$(echo "$USAGE_AFTER" | jq -r '[.byModel[].operation] | unique | sort | join(",")')
echo "operations: $OPS"
test "$OPS" = "chat,generate_report,transcribe" \
  || fail "expected operations 'chat,generate_report,transcribe', got '$OPS'"

# ─── coverage: deep-link resolvers (/p/{id}, /r/{id}) — no CLI command ─
step "GET /p/{project} resolves to projectId"
RESOLVED_P=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$HARPA_API_URL/p/$PROJ")
echo "$RESOLVED_P" | jq .
test "$(echo "$RESOLVED_P" | jq -r .projectId)" = "$PROJ" \
  || fail "resolver /p/{project} returned wrong projectId"

step "GET /r/{report} resolves to projectId + reportNumber"
RESOLVED_R=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$HARPA_API_URL/r/$RPT_ID")
echo "$RESOLVED_R" | jq .
test "$(echo "$RESOLVED_R" | jq -r .projectId)"    = "$PROJ"    || fail "/r resolver wrong projectId"
test "$(echo "$RESOLVED_R" | jq -r .reportNumber)" = "$RPT_NUM" || fail "/r resolver wrong reportNumber"

# ─── be-1: finalize → unfinalize round-trip ───────────────────────
step "reports finalize"
FIN=$($CLI reports finalize "$PROJ" "$RPT_NUM" --json)
test "$(echo "$FIN" | jq -r .report.status)" = "finalized" \
  || fail "expected finalized status"

# ─── coverage: finalize lock-down (update blocked while finalized) ─
step "reports update on finalized → must fail with 409"
if $CLI reports update "$PROJ" "$RPT_NUM" --visit-date 2026-06-01 >/dev/null 2>&1; then
  fail "expected update on finalized report to fail"
fi
echo "✓ update blocked on finalized report"

step "reports unfinalize (flips back to draft)"
UNFIN=$($CLI reports unfinalize "$PROJ" "$RPT_NUM" --json)
test "$(echo "$UNFIN" | jq -r .report.status)" = "draft" \
  || fail "expected draft status after unfinalize"
test "$(echo "$UNFIN" | jq -r .report.finalizedAt)" = "null" \
  || fail "expected finalizedAt cleared after unfinalize"

step "reports unfinalize again → 409 (non-idempotent)"
if $CLI reports unfinalize "$PROJ" "$RPT_NUM" >/dev/null 2>&1; then
  fail "expected unfinalize on draft report to fail with 409"
fi
echo "✓ second unfinalize correctly failed"

# ─── coverage: bootstrap a 2nd user for cross-tenant test ─────────
step "bootstrap bob (second user)"
SUFFIX_B=$(printf "%04d" $(( ($(date +%s) + 1) % 10000 )))
PHONE_B="+1555124${SUFFIX_B}"
$CLI auth otp start "$PHONE_B" >/dev/null
TOKEN_B=$($CLI auth otp verify "$PHONE_B" "$OTP_CODE" --json | jq -r .token)
echo "bob token: ${TOKEN_B:0:24}…"

# ─── coverage: cross-tenant 403 — non-member can't see alice's project ─
step "bob GET /projects/{alice-project} → not 200"
CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN_B" "$HARPA_API_URL/projects/$PROJ")
echo "got HTTP $CODE"
test "$CODE" != "200" || fail "expected bob to be denied, got 200"
echo "✓ cross-tenant access denied (status=$CODE)"

# Note: PATCH /projects/{p}/members/{u} role-change route exists but depends on
# Postgres function `app.update_member_role` which is not present in migrations
# — out of scope for this journey; tracked separately.

# ─── cleanup ──────────────────────────────────────────────────────
step "reports delete"
$CLI reports delete "$PROJ" "$RPT_NUM"

step "projects delete"
$CLI projects delete "$PROJ"

step "auth logout (alice + bob)"
$CLI auth logout
HARPA_TOKEN="$TOKEN_B" $CLI auth logout

echo
echo "✅ Extras journey complete — real uploads + unfinalize + token accounting verified."
