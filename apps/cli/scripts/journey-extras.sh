#!/usr/bin/env bash
# Focused journey for coverage gaps not in ./journey.sh.
#
# Backend-first track (be-1/be-2/be-3):
#   - POST /projects/{project}/reports/{number}/unfinalize (be-1)
#   - LLM token accounting on every chat/transcribe/generate call (be-2)
#   - GET /me/usage with tokens + byModel breakdown (be-3)
#
# Additional coverage gaps:
#   - kind=document file presign/register/url
#   - GET /p/{project} and GET /r/{report} deep-link resolvers
#   - finalize lock-down (update blocked while finalized)
#   - cross-tenant access denial (non-member sees 403/404)
#
# Known backend gap (not asserted): PATCH /projects/{p}/members/{u} returns 500
# because Postgres function `app.update_member_role` is missing from migrations.
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
RPT_JSON=$($CLI reports create "$PROJ" --visit-date 2026-05-17 --json)
RPT_NUM=$(echo "$RPT_JSON" | jq -r .number)
RPT_ID=$(echo  "$RPT_JSON" | jq -r .id)
echo "report number=$RPT_NUM id=$RPT_ID"

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

# ─── coverage: document file kind (main journey only does image+voice) ─
step "files presign + register (document) — coverage for kind=document"
KEY_D=$($CLI files presign --kind document --content-type application/pdf --size 4096 --json | jq -r .fileKey)
FILE_DOC=$($CLI files register --kind document --file-key "$KEY_D" --size 4096 --content-type application/pdf --json | jq -r .id)
echo "document file: $FILE_DOC"
$CLI files url "$FILE_DOC" >/dev/null
echo "✓ signed-GET URL minted for document"

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
# Note: current code only blocks `update` (409); delete + notes are allowed
# on finalized reports by design (delete is cleanup; notes are append-only).
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
step "bob GET /projects/{alice-project} → 403"
CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN_B" "$HARPA_API_URL/projects/$PROJ")
echo "got HTTP $CODE"
# RLS hides the row entirely → API surfaces 404. Either 403 or 404 is acceptable
# (defence-in-depth); we just require it's NOT 200.
test "$CODE" != "200" || fail "expected bob to be denied, got 200"
echo "✓ cross-tenant access denied (status=$CODE)"

# Note: PATCH /projects/{p}/members/{u} role-change route exists but depends on
# Postgres function `app.update_member_role` which is not present in 0003
# migrations — out of scope for this journey; tracked separately.

# ─── cleanup ──────────────────────────────────────────────────────
step "reports delete"
$CLI reports delete "$PROJ" "$RPT_NUM"

step "projects delete"
$CLI projects delete "$PROJ"

step "auth logout (alice + bob)"
$CLI auth logout
HARPA_TOKEN="$TOKEN_B" $CLI auth logout

echo
echo "✅ Extras journey complete — unfinalize + token accounting + usage delta verified."
