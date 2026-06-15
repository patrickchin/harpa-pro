#!/usr/bin/env bash
# Fails if any .maestro/**/*.yaml flow uses coordinate taps. Maestro
# point taps are device-, orientation-, and safe-area-dependent; flows
# should tap stable text, accessibility labels, or testIDs instead.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
MAESTRO_DIR="${MAESTRO_DIR:-$ROOT/.maestro}"

if [ ! -d "$MAESTRO_DIR" ]; then
  echo "skip: .maestro not present"
  exit 0
fi

HITS=$(grep -rInE '^[[:space:]]*point:[[:space:]]*' --include='*.yaml' --include='*.yml' "$MAESTRO_DIR" 2>/dev/null || true)
if [ -n "$HITS" ]; then
  echo "❌ coordinate point taps found in .maestro flows — use text, accessibility labels, or testIDs instead:"
  echo "$HITS"
  exit 1
fi

echo "✅ no coordinate point taps in .maestro/"
