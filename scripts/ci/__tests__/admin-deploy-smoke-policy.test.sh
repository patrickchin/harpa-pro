#!/usr/bin/env bash
# Structural policy for exact-SHA admin Pages verification.
# shellcheck disable=SC2016

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
failures=0

check() {
  local path="$1" needle="$2" description="$3"
  if grep -Fq -- "$needle" "$repo_root/$path"; then
    echo "  ok   - $description"
  else
    echo "  FAIL - $description" >&2
    failures=$((failures + 1))
  fi
}

forbid() {
  local path="$1" needle="$2" description="$3"
  if grep -Fq -- "$needle" "$repo_root/$path"; then
    echo "  FAIL - $description" >&2
    failures=$((failures + 1))
  else
    echo "  ok   - $description"
  fi
}

echo "admin Pages verification policy"

for environment in dev prod; do
  workflow=".github/workflows/admin-${environment}.yml"
  if [[ "$environment" == dev ]]; then
    branch=dev
    origin=https://dev.harpa-pro-admin.pages.dev
  else
    branch=main
    origin=https://harpa-pro-admin.pages.dev
  fi

  check "$workflow" \
    "if: github.event_name == 'push' || github.ref == 'refs/heads/$branch'" \
    "$environment rejects manual verification from another ref"
  check "$workflow" "$origin" \
    "$environment verifies its stable Pages origin"
  check "$workflow" 'bash scripts/ci/verify-pages-deployment.sh' \
    "$environment uses the shared exact-SHA verifier"
  check "$workflow" '--commit "${{ github.sha }}"' \
    "$environment verifies the pushed Git SHA"
  check "$workflow" "--branch $branch" \
    "$environment verifies the expected Pages branch"
  check "$workflow" "--title 'Business activity — Harpa Pro Admin'" \
    "$environment proves the admin console is served"
  check "$workflow" '--missing-route /__missing_admin_route__' \
    "$environment preserves the static 404 contract"
  forbid "$workflow" 'CLOUDFLARE_API_TOKEN' \
    "$environment holds no Cloudflare API token"
  forbid "$workflow" 'wrangler-action' \
    "$environment does not publish with Wrangler"
done

check .github/workflows/admin-prod.yml 'https://admin.harpapro.com' \
  'production verifies the canonical custom domain'
check .github/workflows/admin-preview.yml 'ADMIN_BRANCH: pr-${{ github.event.pull_request.number }}' \
  'preview keeps the exact pr-N branch contract'
check .github/workflows/admin-preview.yml 'bash scripts/ci/verify-pages-deployment.sh' \
  'preview waits for the Cloudflare Git deployment'
check .github/workflows/admin-preview.yml '--commit "${{ github.event.pull_request.head.sha }}"' \
  'preview verifies the immutable pull-request head SHA'

echo
echo "failed: $failures"
[[ "$failures" -eq 0 ]]
