#!/usr/bin/env bash
# End-to-end journey covering every `harpa` CLI command against the
# docker-compose backend (http://localhost:8787, fixture mode).
#
# Prereq:
#   docker compose up -d
#   pnpm --filter @harpa/cli build
#
# Run:
#   HARPA_TOKEN=<disposable-token> MEMBER_EMAIL=member@example.com \
#     ./apps/cli/scripts/journey.sh
#
# Or sign in with the CLI's email-OTP flow:
#   EMAIL=owner@example.com MEMBER_EMAIL=member@example.com \
#     ./apps/cli/scripts/journey.sh
#   # Set OTP_CODE to avoid the interactive prompt after the code is sent.
#
# Each step prints what it's doing, runs the command, and asserts
# `exit == 0`. If anything fails, the script aborts with set -e.
set -euo pipefail

export HARPA_API_URL="${HARPA_API_URL:-http://localhost:8787}"
CLI="node $(cd "$(dirname "$0")/.." && pwd)/dist/index.js"
SAMPLES="$(cd "$(dirname "$0")/samples" && pwd)"
IMG="$SAMPLES/sample.png"
WAV="$SAMPLES/sample.wav"

step() { echo; echo "▶ $*"; }
fail() { echo "✗ $*" >&2; exit 1; }
sign_in_with_email_otp() {
  local email="$1" code="${2:-}"
  $CLI auth otp start "$email" >&2
  if [[ -z "$code" ]]; then
    [[ -t 0 ]] || fail "OTP_CODE is required when stdin is not interactive"
    read -r -s -p "OTP for $email: " code
    echo >&2
  fi
  $CLI auth otp verify "$email" "$code" --raw
}

: "${MEMBER_EMAIL:?MEMBER_EMAIL is required and must name an existing account}"
TOKEN_A="${HARPA_TOKEN:-}"
TOKEN_A_FROM_OTP=0

# ─── 0. health ─────────────────────────────────────────────────────
step "0. health"
$CLI health

# ─── 1. auth — owner ──────────────────────────────────────────────
if [[ -n "$TOKEN_A" ]]; then
  step "1. auth — reuse HARPA_TOKEN"
else
  : "${EMAIL:?EMAIL is required when HARPA_TOKEN is not set}"
  step "1. auth email OTP — start + verify"
  TOKEN_A=$(sign_in_with_email_otp "$EMAIL" "${OTP_CODE:-}")
  TOKEN_A_FROM_OTP=1
fi
test -n "$TOKEN_A" || fail "authentication returned an empty token"
echo "owner token: ${TOKEN_A:0:24}…"

# ─── 2. me ─────────────────────────────────────────────────────────
step "2a. me get (alice)"
HARPA_TOKEN="$TOKEN_A" $CLI me get

step "2b. me update display + company"
HARPA_TOKEN="$TOKEN_A" $CLI me update --display-name "Alice Tester" --company-name "BuildCo"

step "2c. me usage"
HARPA_TOKEN="$TOKEN_A" $CLI me usage

# ─── 3. settings ───────────────────────────────────────────────────
step "3a. settings ai get"
HARPA_TOKEN="$TOKEN_A" $CLI settings ai get

step "3b. settings ai set"
HARPA_TOKEN="$TOKEN_A" $CLI settings ai set --vendor openai --model gpt-4.1-mini

step "3c. settings ai clear"
HARPA_TOKEN="$TOKEN_A" $CLI settings ai set --clear

# ─── 4. projects ───────────────────────────────────────────────────
step "4a. projects list"
HARPA_TOKEN="$TOKEN_A" $CLI projects list

step "4b. projects create → captures slug"
PROJECT_SLUG=$(HARPA_TOKEN="$TOKEN_A" $CLI projects create --name "Riverside Site" --address "1 River Rd" --json | jq -er .id)
echo "project slug: $PROJECT_SLUG"

step "4c. projects get"
HARPA_TOKEN="$TOKEN_A" $CLI projects get "$PROJECT_SLUG"

step "4d. projects update"
HARPA_TOKEN="$TOKEN_A" $CLI projects update "$PROJECT_SLUG" --name "Riverside Site (renamed)"

# ─── 5. projects members (member account must already exist) ──────
step "5a. members add existing account"
HARPA_TOKEN="$TOKEN_A" $CLI projects members add "$PROJECT_SLUG" --email "$MEMBER_EMAIL" --role editor

step "5b. members list"
HARPA_TOKEN="$TOKEN_A" $CLI projects members list "$PROJECT_SLUG"

step "5c. members remove existing account"
HARPA_TOKEN="$TOKEN_A" $CLI projects members remove "$PROJECT_SLUG" "$MEMBER_EMAIL"

# ─── 6. reports ────────────────────────────────────────────────────
step "6a. reports create"
REPORT_NUMBER=$(HARPA_TOKEN="$TOKEN_A" $CLI reports create "$PROJECT_SLUG" --visit-date 2026-05-17 --json | jq -er .number)
echo "report number: $REPORT_NUMBER"

step "6b. reports list"
HARPA_TOKEN="$TOKEN_A" $CLI reports list "$PROJECT_SLUG"

step "6c. reports get"
HARPA_TOKEN="$TOKEN_A" $CLI reports get "$PROJECT_SLUG" "$REPORT_NUMBER"

step "6d. reports update"
HARPA_TOKEN="$TOKEN_A" $CLI reports update "$PROJECT_SLUG" "$REPORT_NUMBER" --visit-date 2026-05-18

# ─── 7. files (presign / register / URL / one-shot upload) ─────────
step "7a. files presign (image)"
PRESIGN_IMG=$(HARPA_TOKEN="$TOKEN_A" $CLI files presign --kind image --content-type image/jpeg --size 1024 --json)
KEY_IMG=$(echo "$PRESIGN_IMG" | jq -r .fileKey)
echo "image fileKey: $KEY_IMG"

step "7b. files register (image)"
FILE_IMG=$(HARPA_TOKEN="$TOKEN_A" $CLI files register --kind image --file-key "$KEY_IMG" --size 1024 --content-type image/jpeg --json | jq -r .id)
echo "image file id: $FILE_IMG"

step "7c. files url (signed GET) for registered image"
HARPA_TOKEN="$TOKEN_A" $CLI files url "$FILE_IMG"

step "7d. files upload (one-shot through local MinIO)"
test -f "$IMG" || fail "missing sample fixture: $IMG"
HARPA_TOKEN="$TOKEN_A" $CLI files upload --file "$IMG" --kind image

# ─── 8. voice (transcribe + summarize) ────────────────────────────
step "8a. files upload (voice)"
test -f "$WAV" || fail "missing sample fixture: $WAV"
FILE_VOICE=$(HARPA_TOKEN="$TOKEN_A" $CLI files upload --file "$WAV" --kind voice --json | jq -er .fileId)
echo "voice file id: $FILE_VOICE"

step "8b. voice transcribe (fixture: transcribe.voice-1)"
HARPA_TOKEN="$TOKEN_A" $CLI voice transcribe --file-id "$FILE_VOICE" --fixture transcribe.voice-1

step "8c. voice summarize (fixture: summarize.voice-1)"
HARPA_TOKEN="$TOKEN_A" $CLI voice summarize --transcript "Concrete pour started at 8am, finished by noon. Crew of four." --fixture summarize.voice-1

# ─── 9. notes ──────────────────────────────────────────────────────
step "9a. notes create (text)"
HARPA_TOKEN="$TOKEN_A" $CLI notes create "$PROJECT_SLUG" "$REPORT_NUMBER" --kind text --body "Site inspection complete."

step "9b. notes create (image attached)"
NOTE_IMG_ID=$(HARPA_TOKEN="$TOKEN_A" $CLI notes create "$PROJECT_SLUG" "$REPORT_NUMBER" --kind image --file-id "$FILE_IMG" --json | jq -er .id)
echo "image note id: $NOTE_IMG_ID"

step "9c. notes list"
HARPA_TOKEN="$TOKEN_A" $CLI notes list "$PROJECT_SLUG" "$REPORT_NUMBER"

step "9d. notes update"
HARPA_TOKEN="$TOKEN_A" $CLI notes update "$NOTE_IMG_ID" --body "Foundation photo at 8:30am"

step "9e. notes delete"
HARPA_TOKEN="$TOKEN_A" $CLI notes delete "$NOTE_IMG_ID"

# ─── 10. reports AI (generate / regenerate / pdf / finalize) ──────
step "10a. reports generate (fixture: generate-report.voice-1)"
HARPA_TOKEN="$TOKEN_A" $CLI reports generate "$PROJECT_SLUG" "$REPORT_NUMBER" --fixture generate-report.voice-1

step "10b. reports regenerate (fixture: generate-report.voice-4)"
HARPA_TOKEN="$TOKEN_A" $CLI reports regenerate "$PROJECT_SLUG" "$REPORT_NUMBER" --fixture generate-report.voice-4

step "10c. reports pdf"
HARPA_TOKEN="$TOKEN_A" $CLI reports pdf "$PROJECT_SLUG" "$REPORT_NUMBER"

step "10d. reports finalize"
HARPA_TOKEN="$TOKEN_A" $CLI reports finalize "$PROJECT_SLUG" "$REPORT_NUMBER"

# ─── 11. cleanup ──────────────────────────────────────────────────
step "11a. reports delete — create a fresh draft to delete (finalized one can't be)"
DRAFT_NUMBER=$(HARPA_TOKEN="$TOKEN_A" $CLI reports create "$PROJECT_SLUG" --json | jq -er .number)
HARPA_TOKEN="$TOKEN_A" $CLI reports delete "$PROJECT_SLUG" "$DRAFT_NUMBER"

step "11b. projects delete"
HARPA_TOKEN="$TOKEN_A" $CLI projects delete "$PROJECT_SLUG"

# ─── 12. auth logout ──────────────────────────────────────────────
if [[ "$TOKEN_A_FROM_OTP" = "1" ]]; then
  step "12. auth logout (script-created session)"
  HARPA_TOKEN="$TOKEN_A" $CLI auth logout
else
  step "12. auth logout skipped (caller supplied HARPA_TOKEN)"
fi
echo
echo "✅ Journey complete — current CLI surface exercised."
