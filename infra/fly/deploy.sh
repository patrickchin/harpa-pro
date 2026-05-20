#!/usr/bin/env bash
# Deploy @harpa/api to Fly.io.
# Wired into CI by .github/workflows/api-prod.yml. For manual deploys:
#   flyctl auth login
#   ./infra/fly/deploy.sh
#
# Computes MIGRATIONS_REQUIRED_HEAD from the migrations directory and
# passes it as a build arg so the running container knows what schema
# head its code expects. /readyz uses it to detect schema drift.
# See docs/v4/arch-cicd-and-migrations.md.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$HERE/../.."

MIGRATIONS_DIR="packages/api/migrations"
HEAD=$(ls "$MIGRATIONS_DIR" | grep -E '\.sql$' | sort | tail -1)
if [[ -z "$HEAD" ]]; then
  echo "ERROR: no .sql files found in $MIGRATIONS_DIR" >&2
  exit 1
fi
echo "deploy: MIGRATIONS_REQUIRED_HEAD=$HEAD"

flyctl deploy \
  --config infra/fly/fly.toml \
  --dockerfile infra/fly/Dockerfile \
  --build-arg "MIGRATIONS_REQUIRED_HEAD=$HEAD" \
  "$@"
