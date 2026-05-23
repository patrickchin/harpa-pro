#!/usr/bin/env bash
# Run all journey tests against a target environment.
#
# Usage:
#   scripts/journey-all.sh              # defaults to dev
#   scripts/journey-all.sh local        # http://localhost:3000
#   scripts/journey-all.sh dev          # harpa-pro-api-dev.fly.dev
#   scripts/journey-all.sh prod         # harpa-pro-api.fly.dev (⚠️ uses real tokens)
#
# Env vars:
#   PASSWORD   — required (test account password, e.g. from Doppler)
#   PHONE      — primary test account (default: +15550199001)
#   PHONE2     — secondary test account (default: +15550199002)
#   VOICE_M4A  — path to real voice sample for core journey (optional)
#   SKIP_STRESS — set to 1 to skip the stress test
#   ONLY       — run only one: "core", "extended", or "stress"
set -euo pipefail

ENV="${1:-dev}"

case "$ENV" in
  local|localhost)
    export BASE="http://localhost:3000"
    ;;
  dev|development)
    export BASE="https://harpa-pro-api-dev.fly.dev"
    ;;
  prod|production)
    export BASE="https://harpa-pro-api.fly.dev"
    echo "⚠️  Running against PRODUCTION — AI tokens will be consumed."
    echo "   Press Ctrl-C within 3s to abort."
    sleep 3
    ;;
  *)
    export BASE="$ENV"
    ;;
esac

: "${PASSWORD:?PASSWORD env var is required}"

DIR="$(cd "$(dirname "$0")" && pwd)"

run() {
  local name="$1" script="$2"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo " Running: $name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if bash "$script"; then
    echo "  ⬆ $name: PASSED"
  else
    echo "  ⬆ $name: FAILED" >&2
    FAILURES=$((FAILURES + 1))
  fi
}

FAILURES=0

if [[ "${ONLY:-}" == "core" || -z "${ONLY:-}" ]]; then
  run "journey-core" "$DIR/journey-core.sh"
fi

if [[ "${ONLY:-}" == "extended" || -z "${ONLY:-}" ]]; then
  run "journey-extended" "$DIR/journey-extended.sh"
fi

if [[ "${ONLY:-}" == "stress" || (-z "${ONLY:-}" && "${SKIP_STRESS:-}" != "1") ]]; then
  run "journey-stress" "$DIR/journey-stress.sh"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ $FAILURES -eq 0 ]]; then
  echo " ✓ All journeys passed ($BASE)"
else
  echo " ✗ $FAILURES journey(s) failed ($BASE)" >&2
  exit 1
fi
