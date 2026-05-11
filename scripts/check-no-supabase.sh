#!/usr/bin/env bash
# Fails if anything under apps/, packages/, or infra/ imports @supabase/* or
# references supabase.* URLs. See docs/v4/pitfalls.md (Pitfall 4 in legacy v3).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
HITS=$(grep -rIE "(@supabase/|supabase\.(co|in)|SUPABASE_)" \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.json' \
  --include='*.toml' --include='*.yaml' --include='*.yml' \
  "$ROOT/apps" "$ROOT/packages" "$ROOT/infra" 2>/dev/null \
  | grep -v 'docs/legacy-v3' || true)
if [ -n "$HITS" ]; then
  echo "❌ Supabase references found (forbidden in v4):"
  echo "$HITS"
  exit 1
fi
echo "✅ no Supabase references"
