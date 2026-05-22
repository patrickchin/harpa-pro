#!/usr/bin/env bash
# Fails if `process.env.R2_*` appears in production source outside
# `packages/api/src/env.ts`. The Zod-parsed `env` const is the single
# point of validation (Pitfall 13 layer 1) — services and routes must
# read R2 config via `env.R2_*`, not raw process.env.
#
# Tests (`*.test.ts`, `*.integration.test.ts`, `*.scope.test.ts`) are
# allowed to mutate process.env because they bootstrap fixtures (e.g.
# pointing the API at an in-test MinIO container).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TARGET="$ROOT/packages/api/src"
if [ ! -d "$TARGET" ]; then
  echo "skip: packages/api/src not present"
  exit 0
fi
HITS=$(grep -rInE 'process\.env\.R2_[A-Z_]+' \
  --include='*.ts' --include='*.tsx' \
  "$TARGET" 2>/dev/null \
  | grep -vE '/env\.ts:' \
  | grep -vE '\.test\.ts:' \
  | grep -vE '\.integration\.test\.ts:' \
  | grep -vE '\.scope\.test\.ts:' \
  | grep -vE '/__tests__/' \
  || true)
if [ -n "$HITS" ]; then
  echo "❌ raw process.env.R2_* outside packages/api/src/env.ts (use env.R2_*):"
  echo "$HITS"
  exit 1
fi
echo "✅ no raw process.env.R2_* outside env.ts"
