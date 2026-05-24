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

EXIT=0
for f in "${ROUTES[@]}"; do
  if ! grep -q "enforceUsageLimit" "$ROOT/$f"; then
    echo "❌ $f does not call enforceUsageLimit — paid-AI route must gate per docs/v4/arch-usage-limits.md §4"
    EXIT=1
  fi
done

if [ $EXIT -eq 0 ]; then
  echo "✅ enforceUsageLimit wired in all paid-AI routes"
fi
exit $EXIT
