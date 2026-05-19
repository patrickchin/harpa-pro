#!/usr/bin/env bash
# Focused journey for backend-first track features (be-1/be-2/be-3):
#   - POST /projects/{project}/reports/{number}/unfinalize (be-1)
#   - LLM token accounting on every chat/transcribe/generate call (be-2)
#   - GET /me/usage with tokens + byModel breakdown (be-3)
#
# Complements ./journey.sh (which exercises every command). This script
# is intentionally narrow: create one project + one report, run AI calls,
# then assert the new fields surface and unfinalize round-trips status.
#
# Prereq:
#   docker compose up -d
#   pnpm --filter @harpa/cli build
#
# Run:
#   ./apps/cli/scripts/journey-extras.sh
set -euo pipefail

export HARPA_API_URL="${HARPA_API_URL:-http://localhost:8787}"
CLI="node $(cd "$(dirname "$0")/.." && pwd)/dist/index.js"

# Use a unique phone per run so baseline usage is always 0.
# Last 4 digits = epoch seconds mod 10000.
SUFFIX=$(printf "%04d" $(( $(date +%s) % 10000 )))
PHONE="+1555123${SUFFIX}"
OTP_CODE="000000"

step() { echo; echo "▶ $*"; }
fail() { echo "✗ $*" >&2; exit 1; }

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
RPT_NUM=$($CLI reports create "$PROJ" --visit-date 2026-05-17 --json | jq -r .number)
echo "report number: $RPT_NUM"

# ─── voice file (presign + register; PUT skipped, fixture mode) ───
step "files presign + register (voice)"
KEY_V=$($CLI files presign --kind voice --content-type audio/m4a --size 2048 --json | jq -r .fileKey)
FILE_VOICE=$($CLI files register --kind voice --file-key "$KEY_V" --size 2048 --content-type audio/m4a --json | jq -r .id)
echo "voice file: $FILE_VOICE"

# ─── be-2: each AI call should record a usage row ─────────────────
step "voice transcribe (records 1 transcribe row)"
$CLI voice transcribe --file-id "$FILE_VOICE" --fixture transcribe.basic

step "voice summarize (records 1 chat row, non-zero tokens)"
$CLI voice summarize --transcript "Crew of four poured concrete at 8am." --fixture summarize.basic

step "reports generate (records 1 generate_report row)"
$CLI reports generate "$PROJ" "$RPT_NUM" --fixture generate-report.full

# ─── be-3: /me/usage reflects all 4 calls ─────────────────────────
step "me usage (after 4 LLM calls)"
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

# ─── be-1: finalize → unfinalize round-trip ───────────────────────
step "reports finalize"
FIN=$($CLI reports finalize "$PROJ" "$RPT_NUM" --json)
test "$(echo "$FIN" | jq -r .report.status)" = "finalized" \
  || fail "expected finalized status"

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

# ─── cleanup ──────────────────────────────────────────────────────
step "reports delete"
$CLI reports delete "$PROJ" "$RPT_NUM"

step "projects delete"
$CLI projects delete "$PROJ"

step "auth logout"
$CLI auth logout

echo
echo "✅ Extras journey complete — unfinalize + token accounting + usage delta verified."
