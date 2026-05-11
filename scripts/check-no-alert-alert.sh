#!/usr/bin/env bash
# Fails if Alert.alert( appears outside apps/mobile/lib/dialogs/.
# See docs/v4/pitfalls.md Pitfall 12.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
if [ ! -d "$ROOT/apps/mobile" ]; then
  echo "skip: apps/mobile not present yet"
  exit 0
fi
HITS=$(grep -rInE "Alert\.alert\(" \
  --include='*.ts' --include='*.tsx' \
  "$ROOT/apps/mobile" 2>/dev/null \
  | grep -v 'apps/mobile/lib/dialogs/' || true)
if [ -n "$HITS" ]; then
  echo "❌ Alert.alert() found outside lib/dialogs/ (use AppDialogSheet):"
  echo "$HITS"
  exit 1
fi
echo "✅ no Alert.alert() outside dialogs"
