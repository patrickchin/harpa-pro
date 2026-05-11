#!/usr/bin/env bash
# Fails if process.env.EXPO_PUBLIC_*! appears outside apps/mobile/lib/env.ts.
# See docs/v4/pitfalls.md Pitfall 5.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
if [ ! -d "$ROOT/apps/mobile" ]; then
  echo "skip: apps/mobile not present yet"
  exit 0
fi
HITS=$(grep -rInE "process\.env\.EXPO_PUBLIC_[A-Z_]+!" \
  --include='*.ts' --include='*.tsx' \
  "$ROOT/apps/mobile" 2>/dev/null \
  | grep -v 'apps/mobile/lib/env.ts' || true)
if [ -n "$HITS" ]; then
  echo "❌ process.env.EXPO_PUBLIC_*! non-null assertion found (use lib/env.ts):"
  echo "$HITS"
  exit 1
fi
echo "✅ no process.env.EXPO_PUBLIC_*! non-null assertions"
