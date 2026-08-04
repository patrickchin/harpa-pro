#!/usr/bin/env bash
# Structural regression for the public/admin Cloudflare Pages boundary.

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
cd "$repo_root"

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
[[ -f apps/admin/src/pages/404.astro ]] \
  || fail "apps/admin must publish a real 404 document"

grep -Eq "site:[[:space:]]*['\"]https://admin\.harpapro\.com['\"]" \
  apps/admin/astro.config.mjs \
  || fail "the admin Astro build must use the canonical admin origin"

grep -Fq 'output_dir=apps/site/dist' scripts/ci/build-cloudflare-pages.sh \
  || fail "the Pages builder must keep the public output isolated"
grep -Fq 'output_dir=apps/admin/dist' scripts/ci/build-cloudflare-pages.sh \
  || fail "the Pages builder must keep the admin output isolated"
grep -Fq 'pnpm --filter @harpa/site build' scripts/ci/build-cloudflare-pages.sh \
  || fail "the Pages builder must target the public workspace"
grep -Fq 'pnpm --filter @harpa/admin build' scripts/ci/build-cloudflare-pages.sh \
  || fail "the Pages builder must target the admin workspace"

for environment in preview dev prod; do
  workflow=".github/workflows/admin-${environment}.yml"
  [[ -f "$workflow" ]] || fail "missing $workflow"
  grep -Fq 'harpa-pro-admin.pages.dev' "$workflow" \
    || fail "$workflow does not verify the admin Pages project"
done

for workflow in .github/workflows/site-preview.yml \
  .github/workflows/site-dev.yml \
  .github/workflows/site-prod.yml; do
  if grep -Fq 'harpa-pro-admin' "$workflow"; then
    fail "$workflow must not target the admin Pages project"
  fi
done

echo "admin-site-separation: ok"
