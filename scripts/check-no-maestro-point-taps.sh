#!/usr/bin/env bash
# Fails if a .maestro/**/*.yaml flow uses an unapproved coordinate tap.
# Maestro point taps are device-, orientation-, and safe-area-dependent, so
# flows must use semantic selectors except for the two centralized iOS native
# Modal fallbacks whose XCTest window is absent from the hierarchy.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
MAESTRO_DIR="${MAESTRO_DIR:-$ROOT/.maestro}"

if [ ! -d "$MAESTRO_DIR" ]; then
  echo "skip: .maestro not present"
  exit 0
fi

HITS=$(grep -rInE '^[[:space:]]*point:[[:space:]]*' --include='*.yaml' --include='*.yml' "$MAESTRO_DIR" 2>/dev/null || true)
UNAPPROVED=$(printf '%s\n' "$HITS" | grep -vE \
  '/helpers/tap-dialog-action\.yaml:[0-9]+:[[:space:]]*point:[[:space:]]*['"'"'"]50%,85%['"'"'"][[:space:]]*$|/helpers/tap-dialog-cancel\.yaml:[0-9]+:[[:space:]]*point:[[:space:]]*['"'"'"]50%,92%['"'"'"][[:space:]]*$' || true)
if [ -n "$UNAPPROVED" ]; then
  echo "❌ unapproved coordinate point taps found in .maestro flows — use text, accessibility labels, or testIDs instead:"
  echo "$UNAPPROVED"
  exit 1
fi

check_exception_count() {
  local file="$1" expected="$2" description="$3"
  [ -f "$file" ] || return 0
  local actual
  actual=$(grep -cE '^[[:space:]]*point:[[:space:]]*['"'"'"]50%,85%['"'"'"][[:space:]]*$' "$file" || true)
  if [ "$actual" -ne "$expected" ]; then
    echo "❌ $description must contain exactly $expected approved point tap(s); found $actual"
    exit 1
  fi
}

check_exception_count "$MAESTRO_DIR/helpers/tap-dialog-action.yaml" 1 \
  "primary native Modal action fallback"

if [ -f "$MAESTRO_DIR/helpers/tap-dialog-cancel.yaml" ]; then
  actual_cancel=$(grep -cE '^[[:space:]]*point:[[:space:]]*['"'"'"]50%,92%['"'"'"][[:space:]]*$' \
    "$MAESTRO_DIR/helpers/tap-dialog-cancel.yaml" || true)
  if [ "$actual_cancel" -ne 1 ]; then
    echo "❌ native Modal cancel fallback must contain exactly 1 approved point tap; found $actual_cancel"
    exit 1
  fi
fi

echo "✅ no unapproved coordinate point taps in .maestro/"
