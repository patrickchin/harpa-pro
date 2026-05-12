#!/usr/bin/env bash
# Spec drift gate (P1.11). Re-emits the OpenAPI spec + regenerates types
# and fails CI if either changed without being committed. Run alongside
# `pnpm lint` in CI.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

pnpm spec:emit >/dev/null
pnpm --filter @harpa/api-contract gen:types >/dev/null

if ! git diff --quiet -- packages/api-contract/openapi.json packages/api-contract/src/generated/types.ts; then
  echo "❌ OpenAPI spec drift detected:"
  git --no-pager diff --stat -- packages/api-contract/openapi.json packages/api-contract/src/generated/types.ts
  echo
  echo "Run: pnpm spec:emit && pnpm --filter @harpa/api-contract gen:types"
  echo "Then commit packages/api-contract/openapi.json + src/generated/types.ts."
  exit 1
fi
echo "✅ openapi.json + generated types in sync with code"
