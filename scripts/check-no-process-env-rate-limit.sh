#!/usr/bin/env bash
# Fails if `process.env.RATE_LIMIT_*` appears in production source
# outside `packages/api/src/env.ts`. The Zod-parsed `env` const is the
# single point of validation (Pitfall 13 sub-pattern). Mirrors
# scripts/check-no-process-env-r2.sh.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
HITS=$(grep -rInE 'process\.env\.RATE_LIMIT_[A-Z_]+' \
  --include='*.ts' --include='*.tsx' \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  --exclude-dir=.next \
  --exclude-dir=.turbo \
  "$ROOT/packages" "$ROOT/apps" 2>/dev/null \
  | grep -vE '/packages/api/src/env\.ts:' \
  | grep -vE '\.test\.ts:' \
  | grep -vE '\.integration\.test\.ts:' \
  | grep -vE '\.scope\.test\.ts:' \
  | grep -vE '/__tests__/' \
  || true)
if [ -n "$HITS" ]; then
  echo "❌ raw process.env.RATE_LIMIT_* outside packages/api/src/env.ts (use env.RATE_LIMIT_*):"
  echo "$HITS"
  exit 1
fi
echo "✅ no raw process.env.RATE_LIMIT_* outside env.ts"
