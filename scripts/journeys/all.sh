#!/usr/bin/env bash
# Run all journey tests against a target environment.
#
# Usage:
#   scripts/journeys/all.sh              # defaults to dev, runs all
#   scripts/journeys/all.sh dev          # explicit target
#   scripts/journeys/all.sh dev stress   # only stress
#   scripts/journeys/all.sh local core   # core against localhost
#
# Order: stress (fast, no AI) → core (live AI) → extended (live AI, longest)
#
# Env vars:
#   PASSWORD   — required (test account password, e.g. from Doppler)
#   EMAIL      — primary test account (default: test@harpapro.com)
#   EMAIL2     — secondary test account (default: test2@harpapro.com)
#   VOICE_M4A  — path to real voice sample for core journey (optional)
set -euo pipefail

ENV="${1:-dev}"
ONLY="${2:-}"

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

# better-auth ships its own per-IP auth-route rate limiter that the
# stress journey may exhaust by design. Pause between journeys so
# the next journey's first sign-in has a clean slate. better-auth's
# default window is 60s; we wait 75s to be safe. This adds a fixed
# ~2.5min to every full all.sh run — acceptable for post-deploy CI
# where the journey total is already several minutes.
RECOVERY_SLEEP="${JOURNEY_RECOVERY_SLEEP:-75}"

# Run shortest first: stress (~10s) → core (~3min) → extended (~5min)
if [[ "$ONLY" == "stress" || -z "$ONLY" ]]; then
  run "journey-stress" "$DIR/stress.sh"
  if [[ -z "$ONLY" ]]; then
    echo ""
    echo "  ⏸️  pausing ${RECOVERY_SLEEP}s for better-auth's rate-limit window to reset"
    sleep "$RECOVERY_SLEEP"
  fi
fi

if [[ "$ONLY" == "core" || -z "$ONLY" ]]; then
  run "journey-core" "$DIR/core.sh"
  if [[ -z "$ONLY" ]]; then
    echo ""
    echo "  ⏸️  pausing ${RECOVERY_SLEEP}s for better-auth's rate-limit window to reset"
    sleep "$RECOVERY_SLEEP"
  fi
fi

if [[ "$ONLY" == "extended" || -z "$ONLY" ]]; then
  run "journey-extended" "$DIR/extended.sh"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ $FAILURES -eq 0 ]]; then
  echo " ✓ All journeys passed ($BASE)"
else
  echo " ✗ $FAILURES journey(s) failed ($BASE)" >&2
  exit 1
fi
