#!/usr/bin/env bash
# Structural regression for the public/admin Cloudflare Pages boundary.

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
cd "$REPO_ROOT"

fail() {
  echo "admin-site-separation: $*" >&2
  exit 1
}

[[ ! -e apps/site/src/pages/admin/activity.astro ]] \
  || fail "the public site still owns /admin/activity"
[[ ! -e apps/site/src/components/admin/AdminActivity.tsx ]] \
  || fail "the public site still contains the admin activity client"
[[ ! -e apps/site/src/lib/admin-auth.ts ]] \
  || fail "the public site still contains the admin auth client"

[[ -f apps/admin/src/pages/index.astro ]] \
  || fail "apps/admin must render the console at its root"
[[ ! -e apps/admin/public/_redirects ]] \
  || fail "apps/admin must not publish a legacy activity redirect"
[[ ! -e apps/admin/src/pages/admin/activity.astro ]] \
  || fail "apps/admin must not publish a legacy activity page"

grep -Eq "site:[[:space:]]*['\"]https://admin\.harpapro\.com['\"]" \
  apps/admin/astro.config.mjs \
  || fail "the admin Astro build must use the admin canonical origin"

for environment in preview dev prod; do
  workflow=".github/workflows/admin-${environment}.yml"
  [[ -f "$workflow" ]] || fail "missing $workflow"
  grep -Fq -- '--project-name=harpa-pro-admin' "$workflow" \
    || fail "$workflow does not target harpa-pro-admin"
  grep -Fq 'apps/admin/dist' "$workflow" \
    || fail "$workflow does not deploy the admin artifact"
done

for workflow in .github/workflows/site-preview.yml \
  .github/workflows/site-dev.yml \
  .github/workflows/site-prod.yml; do
  if grep -Fq 'harpa-pro-admin' "$workflow"; then
    fail "$workflow must not deploy the admin Pages project"
  fi
done

echo "admin-site-separation: ok"
