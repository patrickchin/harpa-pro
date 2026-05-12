#!/usr/bin/env bash
# Deploy @harpa/api to Fly.io.
# Wired into CI by deploy.yml (P4). For manual deploys:
#   flyctl auth login
#   ./infra/fly/deploy.sh
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$HERE/../.."
flyctl deploy --config infra/fly/fly.toml --dockerfile infra/fly/Dockerfile "$@"
