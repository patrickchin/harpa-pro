#!/usr/bin/env bash
# Fails if hex color literals (#abc / #abcdef) appear in apps/mobile/components/**.
# Use Tailwind tokens from tailwind.config.js. See docs/v4/pitfalls.md Pitfall 3.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
if [ ! -d "$ROOT/apps/mobile/components" ]; then
  echo "skip: apps/mobile/components not present yet"
  exit 0
fi
# Match #fff #abcdef but exclude #ff (too short) and # in regex strings.
HITS=$(grep -rInE "#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?\b" \
  --include='*.ts' --include='*.tsx' \
  "$ROOT/apps/mobile/components" 2>/dev/null || true)
if [ -n "$HITS" ]; then
  echo "❌ hex color literals found in components (use Tailwind tokens):"
  echo "$HITS"
  exit 1
fi
echo "✅ no hex color literals in components"
