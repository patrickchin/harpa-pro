#!/usr/bin/env bash
# Per-account usage limits — chokepoint gate.
#
# Every route handler that consumes paid AI capacity (report
# generation + voice transcribe/summarize/aggregator) MUST call
# enforceUsageLimit() before the costly side-effect. This script
# verifies that the allowlisted route files reference the chokepoint;
# CI fails if a new paid-AI route is added without wiring.
#
# Pitfall 13 — default wiring is the spec. If you add a new paid-AI
# route, add it to ROUTES below and add an at-limit integration test
# that exercises the route without stubs.
#
# See docs/v4/arch-usage-limits.md §4 + pitfalls.md.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)

ROUTES=(
  "packages/api/src/routes/reports.ts"
  "packages/api/src/routes/voice.ts"
)

# Phase 2 — token-bucket post-hoc gating lives at the AI chokepoint.
# Verify `services/ai.ts::withUsageAccounting` calls enforceTokenLimits
# so every paid AI call (transcribe, chat, generate_report) is gated.
TOKEN_GATE="packages/api/src/services/ai.ts"

EXIT=0
for f in "${ROUTES[@]}"; do
  if ! grep -q "enforceUsageLimit" "$ROOT/$f"; then
    echo "❌ $f does not call enforceUsageLimit — paid-AI route must gate per docs/v4/arch-usage-limits.md §4"
    EXIT=1
  fi
done

if ! grep -q "enforceTokenLimits" "$ROOT/$TOKEN_GATE"; then
  echo "❌ $TOKEN_GATE does not call enforceTokenLimits — token bucket post-hoc gate missing per docs/v4/arch-usage-limits.md §4.1"
  EXIT=1
fi

if [ $EXIT -eq 0 ]; then
  echo "✅ enforceUsageLimit + enforceTokenLimits wired in all paid-AI sites"
fi
exit $EXIT
