#!/usr/bin/env bash
# Fails if `process.env.R2_*` appears in production source outside
# `packages/api/src/env.ts`. The Zod-parsed `env` const is the single
# point of validation (Pitfall 13 layer 1) — services and routes must
# read R2 config via `env.R2_*`, not raw process.env.
#
# Scope: the entire monorepo (packages/, apps/, scripts under each
# package). Only `packages/api/src/env.ts` and test files
# (`*.test.ts`, `*.integration.test.ts`, `*.scope.test.ts`,
# `**/__tests__/**`) are allowed to touch raw `process.env.R2_*`.
# Tests bootstrap fixtures (MinIO container, replay-mode toggle) so
# they need the escape hatch.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
HITS=$(grep -rInE 'process\.env\.R2_[A-Z_]+' \
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
  echo "❌ raw process.env.R2_* outside packages/api/src/env.ts (use env.R2_*):"
  echo "$HITS"
  exit 1
fi
echo "✅ no raw process.env.R2_* outside env.ts"
