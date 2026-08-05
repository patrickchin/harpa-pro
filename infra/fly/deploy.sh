#!/usr/bin/env bash
# Deploy @harpa/api to Fly.io.
# Wired into CI by .github/workflows/api-prod.yml. For manual deploys:
#   flyctl auth login
#   ./infra/fly/deploy.sh
#
# Computes the application and admin migration heads and passes them as
# separate build args. /readyz checks the app database;
# /admin/readyz checks the isolated admin database.
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

ADMIN_MIGRATIONS_DIR="packages/api/admin-migrations"
ADMIN_MIGRATION_FILES=("$ADMIN_MIGRATIONS_DIR"/*.sql)
if [[ ! -e "${ADMIN_MIGRATION_FILES[0]}" ]]; then
  echo "ERROR: no .sql files found in $ADMIN_MIGRATIONS_DIR" >&2
  exit 1
fi
ADMIN_HEAD=$(printf '%s\n' "${ADMIN_MIGRATION_FILES[@]##*/}" | LC_ALL=C sort | tail -1)
echo "deploy: ADMIN_MIGRATIONS_REQUIRED_HEAD=$ADMIN_HEAD"

GIT_COMMIT=$(git rev-parse HEAD)
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "deploy: GIT_COMMIT=$GIT_COMMIT BUILD_TIME=$BUILD_TIME"

flyctl deploy \
  --config infra/fly/fly.toml \
  --dockerfile infra/fly/Dockerfile \
  --build-arg "MIGRATIONS_REQUIRED_HEAD=$HEAD" \
  --build-arg "ADMIN_MIGRATIONS_REQUIRED_HEAD=$ADMIN_HEAD" \
  --build-arg "GIT_COMMIT=$GIT_COMMIT" \
  --build-arg "BUILD_TIME=$BUILD_TIME" \
  "$@"

# Repair only a current-release singleton active or singleton standby, after
# proving its Fly release metadata and image match the deployed app Machines.
# Success requires a fresh inventory with one active and one valid standby.
bash scripts/ci/repair-storage-worker-topology.sh harpa-pro-api

# Fail closed unless Fly now reports a started service-less worker.
bash scripts/ci/verify-storage-worker-started.sh harpa-pro-api

# Arm only after deploy, narrow repair, and worker verification succeed. The
# helper targets the exact started worker through Fly's bounded Machine exec
# API, retries the monotonic command safely, and requires its confirmation
# marker. CI and manual callers never need the production DATABASE_URL because
# the command inherits the Machine's staged Fly secrets.
bash scripts/ci/arm-storage-lifecycle-rollout.sh harpa-pro-api
