#!/usr/bin/env bash
# Fails if react-native-unistyles appears anywhere outside docs/legacy-v3/.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
HITS=$(grep -rIE "react-native-unistyles" \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.json' \
  "$ROOT/apps" "$ROOT/packages" 2>/dev/null \
  | grep -v 'docs/legacy-v3' || true)
if [ -n "$HITS" ]; then
  echo "❌ Unistyles references found (we use NativeWind in v4):"
  echo "$HITS"
  exit 1
fi
echo "✅ no Unistyles references"
