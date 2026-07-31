#!/usr/bin/env bash
# Structural policy for stable admin Pages post-deploy verification.
# Workflow assertions below intentionally contain literal runner variables.
# shellcheck disable=SC2016

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
FAIL=0

pass() {
  echo "  ok   - $1"
}

fail() {
  echo "  FAIL - $1" >&2
  FAIL=$((FAIL + 1))
}

require_fixed() {
  local workflow="$1" needle="$2" description="$3"
  if grep -Fq -- "$needle" "$REPO_ROOT/$workflow"; then
    pass "$description"
  else
    fail "$description"
  fi
}

require_fixed_count() {
  local workflow="$1" needle="$2" expected="$3" description="$4"
  local actual
  actual=$(grep -Fc -- "$needle" "$REPO_ROOT/$workflow" || true)
  if [[ "$actual" -eq "$expected" ]]; then
    pass "$description"
  else
    fail "$description (expected $expected, found $actual)"
  fi
}

require_before() {
  local workflow="$1" first="$2" second="$3" description="$4"
  local first_line second_line
  first_line=$(grep -nF -- "$first" "$REPO_ROOT/$workflow" | head -1 | cut -d: -f1 || true)
  second_line=$(grep -nF -- "$second" "$REPO_ROOT/$workflow" | head -1 | cut -d: -f1 || true)
  if [[ -n "$first_line" && -n "$second_line" && "$first_line" -lt "$second_line" ]]; then
    pass "$description"
  else
    fail "$description"
  fi
}

forbid_fixed() {
  local workflow="$1" needle="$2" description="$3"
  if grep -Fq -- "$needle" "$REPO_ROOT/$workflow"; then
    fail "$description"
  else
    pass "$description"
  fi
}

echo "admin deploy smoke policy"

for environment in dev prod; do
  workflow=".github/workflows/admin-${environment}.yml"
  if [[ "$environment" == "dev" ]]; then
    origin="https://dev.harpa-pro-admin.pages.dev"
    branch="dev"
    api_origin="https://harpa-pro-api-dev.fly.dev"
  else
    origin="https://harpa-pro-admin.pages.dev"
    branch="main"
    api_origin="https://api.harpapro.com"
  fi

  require_fixed "$workflow" \
    "if: github.event_name == 'push' || github.ref == 'refs/heads/$branch'" \
    "$environment rejects manual deploys from other refs"
  require_fixed "$workflow" \
    "ADMIN_ORIGIN: $origin" \
    "$environment verifies its stable Pages host"
  require_fixed "$workflow" \
    "EXPECTED_API_ORIGIN: $api_origin" \
    "$environment declares its canonical API origin for artifact verification"
  require_fixed "$workflow" \
    "- name: Verify admin API URL is inlined" \
    "$environment verifies the built API URL"
  require_before "$workflow" \
    "- name: Verify admin API URL is inlined" \
    "- name: Deploy admin site to Cloudflare Pages" \
    "$environment verifies the API URL before deployment"
  require_fixed "$workflow" \
    "grep -R -Fq --include='*.js' \"\$EXPECTED_API_ORIGIN\" apps/admin/dist" \
    "$environment requires the canonical API URL in the JavaScript bundle"
  require_fixed "$workflow" \
    "grep -R -Fq --include='*.js' 'http://localhost:8787' apps/admin/dist" \
    "$environment rejects a local API URL in the JavaScript bundle"
  require_fixed "$workflow" \
    "- name: Verify stable admin Pages host" \
    "$environment has a post-deploy verification step"
  require_before "$workflow" \
    "- name: Deploy admin site to Cloudflare Pages" \
    "- name: Verify stable admin Pages host" \
    "$environment verifies only after deployment"
  require_fixed_count "$workflow" \
    'local deadline=$((SECONDS + 180))' 1 \
    "$environment bounds Pages propagation retries to three minutes"
  require_fixed "$workflow" \
    'curl --fail --silent --show-error' \
    "$environment fails closed when the root is unavailable"
  require_fixed "$workflow" \
    '"${ADMIN_ORIGIN}/"' \
    "$environment requests the admin root"
  require_fixed "$workflow" \
    '<title>Business activity — Harpa Pro Admin</title>' \
    "$environment proves the root serves the admin console"
  require_fixed "$workflow" \
    'cmp -s apps/admin/dist/index.html "$remote_html"' \
    "$environment proves the stable root matches the built artifact"
  forbid_fixed "$workflow" \
    '"${ADMIN_ORIGIN}/admin/activity"' \
    "$environment does not request a legacy browser route"
  forbid_fixed "$workflow" \
    'verify_legacy_redirect' \
    "$environment has no legacy redirect verifier"
  require_fixed "$workflow" \
    '"${ADMIN_ORIGIN}/__missing_admin_route__"' \
    "$environment probes a generic missing route"
  require_fixed "$workflow" \
    'retry "Stable admin host did not return 404 for an unknown route" verify_missing_route' \
    "$environment requires the generic missing route to remain absent"
  require_fixed "$workflow" \
    'retry "Stable admin root did not serve the deployed console" verify_root' \
    "$environment retries the root verifier"
done

require_fixed ".github/workflows/admin-preview.yml" \
  '--retry 24' \
  "preview tolerates first-deployment Pages propagation"
require_fixed ".github/workflows/admin-preview.yml" \
  '--retry-max-time 180' \
  "preview keeps propagation retries bounded"
require_fixed ".github/workflows/admin-preview.yml" \
  '"${ADMIN_PREVIEW_ORIGIN}/__missing_admin_route__"' \
  "preview probes a generic missing route"
require_fixed ".github/workflows/admin-preview.yml" \
  '[[ "$status" == "404" ]]' \
  "preview requires the generic missing route to return 404"

echo
echo "failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
