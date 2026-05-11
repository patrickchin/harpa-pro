#!/usr/bin/env bash
# For every authed route file in packages/api/src/routes/, ensure there's a
# matching scope test in packages/api/src/__tests__/scope/.
# See docs/v4/pitfalls.md Pitfall 6.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
ROUTES_DIR="$ROOT/packages/api/src/routes"
SCOPE_DIR="$ROOT/packages/api/src/__tests__/scope"

if [ ! -d "$ROUTES_DIR" ]; then
  echo "skip: routes dir not present yet"
  exit 0
fi
mkdir -p "$SCOPE_DIR"

MISSING=()
for f in "$ROUTES_DIR"/*.ts; do
  [ -f "$f" ] || continue
  name=$(basename "$f" .ts)
  # Public auth routes don't need scope tests.
  case "$name" in
    auth|index|health|public) continue ;;
  esac
  if ! grep -q "" "$SCOPE_DIR/${name}.scope.test.ts" 2>/dev/null; then
    MISSING+=("$name")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "❌ Missing scope tests for routes: ${MISSING[*]}"
  echo "   Expected: packages/api/src/__tests__/scope/<route>.scope.test.ts"
  exit 1
fi
echo "✅ scope tests present for all authed routes"
