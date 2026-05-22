#!/usr/bin/env bash
# Fails if any .maestro/**/*.yaml flow hardcodes the iOS bundle id
# `com.harpa.pro`. Flows must reference `${MAESTRO_APP_ID}` so the
# same YAML works against dev/prod/EAS variants of the app — see
# docs/v4/pitfalls.md (Maestro appId hardcode regression, R-Maestro1)
# and docs/bugs/README.md.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
if [ ! -d "$ROOT/.maestro" ]; then
  echo "skip: .maestro not present"
  exit 0
fi
HITS=$(grep -rInE 'com\.harpa\.pro' --include='*.yaml' --include='*.yml' "$ROOT/.maestro" 2>/dev/null || true)
if [ -n "$HITS" ]; then
  echo "❌ literal 'com.harpa.pro' found in .maestro flows — use \${MAESTRO_APP_ID}:"
  echo "$HITS"
  exit 1
fi
echo "✅ no hardcoded com.harpa.pro in .maestro/"
