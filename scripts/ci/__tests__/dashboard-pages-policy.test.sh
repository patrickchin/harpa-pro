#!/usr/bin/env bash
# Static policy for tokenless dashboard Cloudflare Pages Git deployments.
# shellcheck disable=SC2016
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PREVIEW="$REPO_ROOT/.github/workflows/dashboard-preview.yml"
DEV="$REPO_ROOT/.github/workflows/dashboard-dev.yml"
PROD="$REPO_ROOT/.github/workflows/dashboard-prod.yml"
FAIL=0

pass() { echo "  ok   - $1"; }
fail() { echo "  FAIL - $1"; FAIL=$((FAIL + 1)); }

require_file() {
  local file="$1" description="$2"
  if [[ -f "$file" ]]; then pass "$description"; else fail "$description"; fi
}

require_fixed() {
  local file="$1" needle="$2" description="$3"
  if [[ -f "$file" ]] && grep -Fq -- "$needle" "$file"; then
    pass "$description"
  else
    fail "$description"
    echo "         missing '$needle' in ${file#"$REPO_ROOT"/}"
  fi
}

forbid_fixed() {
  local file="$1" needle="$2" description="$3"
  if [[ -f "$file" ]] && ! grep -Fq -- "$needle" "$file"; then
    pass "$description"
  else
    fail "$description"
    echo "         unexpected '$needle' in ${file#"$REPO_ROOT"/}"
  fi
}

require_before() {
  local file="$1" first="$2" second="$3" description="$4"
  local first_line second_line
  first_line="$(grep -nF -- "$first" "$file" | head -1 | cut -d: -f1 || true)"
  second_line="$(grep -nF -- "$second" "$file" | head -1 | cut -d: -f1 || true)"
  if [[ -n "$first_line" && -n "$second_line" && "$first_line" -lt "$second_line" ]]; then
    pass "$description"
  else
    fail "$description"
  fi
}

job_body() {
  local file="$1" job="$2"
  awk -v header="  ${job}:" '
    $0 == header { in_job = 1 }
    in_job && $0 ~ /^  [^[:space:]][^:]*:$/ && $0 != header { exit }
    in_job { print }
  ' "$file"
}

require_job_fixed() {
  local file="$1" job="$2" needle="$3" description="$4"
  if job_body "$file" "$job" | grep -Fq -- "$needle"; then
    pass "$description"
  else
    fail "$description"
  fi
}

echo "dashboard Pages Git deployment policy"

require_file "$PREVIEW" "dashboard preview workflow exists"
require_file "$DEV" "dashboard dev workflow exists"
require_file "$PROD" "dashboard production workflow exists"

for workflow in "$PREVIEW" "$DEV" "$PROD"; do
  label="$(basename "$workflow")"
  forbid_fixed "$workflow" "CLOUDFLARE_API_TOKEN" "$label holds no Cloudflare API token"
  forbid_fixed "$workflow" "CLOUDFLARE_ACCOUNT_ID" "$label holds no Cloudflare account id"
  forbid_fixed "$workflow" "cloudflare/wrangler-action" "$label does not publish with Wrangler"
  forbid_fixed "$workflow" "pages deploy apps/dashboard/dist" "$label does not directly upload Pages bytes"
  require_fixed "$workflow" \
    "bash scripts/ci/verify-pages-deployment.sh" \
    "$label verifies the exact Cloudflare Git deployment"
  require_fixed "$workflow" \
    "bash scripts/ci/verify-dashboard-pages.sh" \
    "$label preserves the dashboard SPA routing gate"
  require_fixed "$workflow" \
    "bash scripts/ci/verify-api-release.sh" \
    "$label verifies the matching Fly API"
  require_before "$workflow" \
    "bash scripts/ci/verify-api-release.sh" \
    "bash scripts/ci/verify-pages-deployment.sh" \
    "$label proves API compatibility before accepting Pages"
  require_before "$workflow" \
    "bash scripts/ci/verify-pages-deployment.sh" \
    "bash scripts/ci/verify-dashboard-pages.sh" \
    "$label proves the exact marker before the SPA check"
done

require_fixed "$PREVIEW" ".github/workflows/pages-preview-ref.yml" \
  "preview-ref changes rerun the dashboard preview"
require_fixed "$PREVIEW" "scripts/ci/build-cloudflare-pages.sh" \
  "Cloudflare builder changes rerun the dashboard preview"
require_fixed "$PREVIEW" "scripts/ci/verify-pages-deployment.sh" \
  "exact-SHA verifier changes rerun the dashboard preview"
require_fixed "$PREVIEW" \
  'DASHBOARD_PREVIEW_ORIGIN: https://pr-${{ github.event.pull_request.number }}.harpa-pro-dashboard.pages.dev' \
  "preview targets the stable Cloudflare Git alias"
require_fixed "$PREVIEW" \
  'API_PREVIEW_ORIGIN: https://harpa-pro-api-pr-${{ github.event.pull_request.number }}.fly.dev' \
  "preview targets the matching isolated Fly API"
forbid_fixed "$PREVIEW" "https://harpa-pro-api-dev.fly.dev" \
  "preview never mutates the shared dev API"
require_fixed "$PREVIEW" \
  'EXPECTED_GIT_COMMIT: ${{ github.sha }}' \
  "preview verifies the synthetic merge SHA on Fly"
require_fixed "$PREVIEW" \
  '--commit "${{ github.event.pull_request.head.sha }}"' \
  "preview verifies the PR head SHA published by Cloudflare Git"
require_fixed "$PREVIEW" \
  '--branch "$DASHBOARD_BRANCH"' \
  "preview verifies the mirrored pr-number branch"
require_fixed "$PREVIEW" \
  'VITE_API_BASE_URL: ${{ env.API_PREVIEW_ORIGIN }}' \
  "local preview build uses the matching API URL"
require_fixed "$PREVIEW" \
  "VITE_PASSWORD_ACCOUNT_EMAILS:" \
  "local preview build preserves the password-account allowlist"
require_fixed "$PREVIEW" \
  "pnpm --filter @harpa/dashboard exec playwright install --with-deps chromium firefox webkit msedge" \
  "preview installs all supported local browser engines"
require_fixed "$PREVIEW" \
  "pnpm --filter @harpa/dashboard test:e2e" \
  "preview keeps the mocked cross-browser Playwright gate"
require_fixed "$PREVIEW" \
  "pnpm --filter @harpa/dashboard test:e2e:live" \
  "preview keeps the deployed live Playwright gate"
require_fixed "$PREVIEW" \
  'DASHBOARD_LIVE_BASE_URL: ${{ env.DASHBOARD_PREVIEW_ORIGIN }}' \
  "live Playwright uses the exact verified stable alias"
require_before "$PREVIEW" \
  "bash scripts/ci/verify-dashboard-pages.sh" \
  "pnpm --filter @harpa/dashboard test:e2e:live" \
  "preview verifies SPA routing before live browser mutations"
forbid_fixed "$PREVIEW" \
  "uses: marocchino/sticky-pull-request-comment@v3" \
  "preview leaves the Pages deployment comment to Cloudflare"

require_fixed "$DEV" "https://dev.harpa-pro-dashboard.pages.dev" \
  "dev verifies the stable Cloudflare Git alias"
require_fixed "$DEV" "https://harpa-pro-api-dev.fly.dev/healthz" \
  "dev verifies the development Fly API"
require_fixed "$DEV" '--commit "${{ github.sha }}"' \
  "dev requires its exact pushed SHA"
require_fixed "$DEV" "--branch dev" \
  "dev requires the Cloudflare dev branch marker"
require_fixed "$DEV" "cancel-in-progress: true" \
  "stale dev verification is cancellable"

require_fixed "$PROD" "https://harpa-pro-dashboard.pages.dev" \
  "production verifies the Pages project origin"
require_fixed "$PROD" "https://app.harpapro.com" \
  "production verifies the custom dashboard origin"
require_job_fixed "$PROD" "api" \
  "vars.DASHBOARD_PRODUCTION_ENABLED == 'true'" \
  "production API verification stays dormant before activation"
require_job_fixed "$PROD" "api" \
  "github.ref == 'refs/heads/main'" \
  "production API verification accepts only the main ref"
require_job_fixed "$PROD" "deployment" \
  "vars.DASHBOARD_PRODUCTION_ENABLED == 'true'" \
  "production Pages verification stays dormant before activation"
require_job_fixed "$PROD" "deployment" \
  "github.ref == 'refs/heads/main'" \
  "production Pages verification accepts only the main ref"
require_fixed "$PROD" "https://api.harpapro.com/healthz" \
  "production verifies the production Fly API"
require_fixed "$PROD" '--commit "${{ github.sha }}"' \
  "production requires its exact pushed SHA"
require_fixed "$PROD" "--branch main" \
  "production requires the Cloudflare production branch marker"
require_fixed "$PROD" "cancel-in-progress: false" \
  "production verification is never cancelled mid-flight"

echo
echo "failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
