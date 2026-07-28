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
MIGRATION_FILES=("$MIGRATIONS_DIR"/*.sql)
if [[ ! -e "${MIGRATION_FILES[0]}" ]]; then
  echo "ERROR: no .sql files found in $MIGRATIONS_DIR" >&2
  exit 1
fi
HEAD=$(printf '%s\n' "${MIGRATION_FILES[@]##*/}" | LC_ALL=C sort | tail -1)
echo "deploy: MIGRATIONS_REQUIRED_HEAD=$HEAD"

GIT_COMMIT=$(git rev-parse HEAD)
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "deploy: GIT_COMMIT=$GIT_COMMIT BUILD_TIME=$BUILD_TIME"

flyctl deploy \
  --config infra/fly/fly.toml \
  --dockerfile infra/fly/Dockerfile \
  --build-arg "MIGRATIONS_REQUIRED_HEAD=$HEAD" \
  --build-arg "GIT_COMMIT=$GIT_COMMIT" \
  --build-arg "BUILD_TIME=$BUILD_TIME" \
  "$@"

# The HTTP app group may suspend at zero when idle, but delayed R2 cleanup
# must still run after presigned URLs expire. Keep one service-less worker
# machine running so the durable job table always has an executor.
flyctl scale count storage-worker=1 --app harpa-pro-api

# Arm only after deploy and worker scaling succeed. Run inside the service-less
# worker so CI and manual callers never need the production DATABASE_URL; the
# command inherits the app's staged Fly secrets. The update is monotonic, so
# later deploys cannot reopen the first-rollout compatibility grace.
flyctl ssh console \
  --app harpa-pro-api \
  --process-group storage-worker \
  --pty=false \
  --command \
  'STORAGE_LEASE_ROLLOUT_GRACE_SEC=330 STORAGE_ACCOUNT_DELETE_ENABLED=true pnpm --filter @harpa/api storage:arm-leases'
