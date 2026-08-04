#!/usr/bin/env bash
# Static policy tests for the dashboard Cloudflare Pages release chain.
#
# User journeys pinned here:
#   - A reviewer gets one immutable dashboard URL and one stable PR alias.
#   - Dashboard previews always use their isolated PR API.
#   - Dev and production builds never point at the wrong API environment.
#   - Every environment deploys to the dashboard's own Pages project and proves
#     that a directly loaded client-side route receives the SPA entry document.
#
# These assertions deliberately inspect workflow text. GitHub-hosted deployment
# behavior is covered separately by verify-dashboard-pages.test.sh.
# shellcheck disable=SC2016
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PREVIEW="$REPO_ROOT/.github/workflows/dashboard-preview.yml"
DEV="$REPO_ROOT/.github/workflows/dashboard-dev.yml"
PROD="$REPO_ROOT/.github/workflows/dashboard-prod.yml"
FAIL=0

pass() {
  echo "  ok   - $1"
}

fail() {
  echo "  FAIL - $1"
  FAIL=$((FAIL + 1))
}

require_file() {
  local file="$1"
  local description="$2"

  if [[ -f "$file" ]]; then
    pass "$description"
  else
    fail "$description (missing ${file#"$REPO_ROOT"/})"
  fi
}

require_fixed() {
  local file="$1"
  local needle="$2"
  local description="$3"

  if [[ -f "$file" ]] && grep -Fq -- "$needle" "$file"; then
    pass "$description"
  else
    fail "$description"
    echo "         missing '$needle' in ${file#"$REPO_ROOT"/}"
  fi
}

forbid_fixed() {
  local file="$1"
  local needle="$2"
  local description="$3"

  if [[ -f "$file" ]] && ! grep -Fq -- "$needle" "$file"; then
    pass "$description"
  else
    fail "$description"
    echo "         unexpected '$needle' in ${file#"$REPO_ROOT"/}"
  fi
}

require_before() {
  local file="$1"
  local first="$2"
  local second="$3"
  local description="$4"
  local first_line
  local second_line

  first_line="$(grep -nF -- "$first" "$file" | head -1 | cut -d: -f1 || true)"
  second_line="$(grep -nF -- "$second" "$file" | head -1 | cut -d: -f1 || true)"

  if [[ -n "$first_line" && -n "$second_line" && "$first_line" -lt "$second_line" ]]; then
    pass "$description"
  else
    fail "$description"
  fi
}

echo "dashboard Pages deployment policy"

require_file "$PREVIEW" "dashboard preview workflow exists"
require_file "$DEV" "dashboard dev workflow exists"
require_file "$PROD" "dashboard production workflow exists"

for workflow in "$PREVIEW" "$DEV" "$PROD"; do
  label="$(basename "$workflow")"
  require_fixed "$workflow" \
    "pages deploy apps/dashboard/dist" \
    "$label uploads the Vite static build"
  require_fixed "$workflow" \
    "--project-name=harpa-pro-dashboard" \
    "$label targets the dedicated dashboard Pages project"
  require_fixed "$workflow" \
    "--commit-hash=" \
    "$label records the source commit on the deployment"
  require_fixed "$workflow" \
    "bash scripts/ci/verify-dashboard-pages.sh" \
    "$label verifies deployed SPA routing"
  require_fixed "$workflow" \
    "bash scripts/ci/verify-api-release.sh" \
    "$label verifies the selected API before publishing"
  require_fixed "$workflow" \
    "bash scripts/ci/ensure-dashboard-pages-project.sh" \
    "$label ensures the dedicated Pages project exists"
  require_before "$workflow" \
    "pnpm --filter @harpa/dashboard build" \
    "pages deploy apps/dashboard/dist" \
    "$label builds before deployment"
  require_before "$workflow" \
    "bash scripts/ci/verify-api-release.sh" \
    "pages deploy apps/dashboard/dist" \
    "$label waits for a compatible API before deployment"
  require_before "$workflow" \
    "bash scripts/ci/ensure-dashboard-pages-project.sh" \
    "pages deploy apps/dashboard/dist" \
    "$label creates or reads the Pages project before deployment"
  require_before "$workflow" \
    "pages deploy apps/dashboard/dist" \
    "bash scripts/ci/verify-dashboard-pages.sh" \
    "$label verifies only after deployment"
  forbid_fixed "$workflow" \
    "--project-name=harpa-pro " \
    "$label cannot deploy into the public-site Pages project"
  forbid_fixed "$workflow" \
    "wranglerVersion:" \
    "$label reuses the workspace Wrangler version"
done

require_fixed "$PREVIEW" \
  "https://harpa-pro-api-pr-\${PR_NUMBER}.fly.dev" \
  "previews point at the matching isolated Fly API"
forbid_fixed "$PREVIEW" \
  "https://harpa-pro-api-dev.fly.dev" \
  "previews never mutate the shared dev API"
require_fixed "$PREVIEW" \
  'VITE_API_BASE_URL: ${{ steps.api.outputs.base-url }}' \
  "preview injects the selected API URL at build time"
require_fixed "$PREVIEW" \
  'EXPECTED_GIT_COMMIT: ${{ github.sha }}' \
  "preview verifies the same synthetic merge commit deployed by pr-preview"
require_fixed "$PREVIEW" \
  '--commit-hash=${{ github.sha }}' \
  "preview records the commit actually checked out and tested"
require_fixed "$PREVIEW" \
  '--branch=pr-${{ github.event.pull_request.number }}' \
  "preview uses a collision-free PR branch alias"
require_fixed "$PREVIEW" \
  '${{ steps.deploy.outputs.deployment-url }}' \
  "preview surfaces the immutable Cloudflare deployment URL"
require_fixed "$PREVIEW" \
  '${{ steps.deploy.outputs.pages-deployment-alias-url }}' \
  "preview surfaces the stable PR alias URL"
require_fixed "$PREVIEW" \
  "uses: marocchino/sticky-pull-request-comment@v2" \
  "preview maintains one sticky PR comment"
require_fixed "$PREVIEW" \
  "header: dashboard-preview" \
  "preview comment has a dashboard-specific identity"
require_fixed "$PREVIEW" \
  "github.event.pull_request.head.repo.full_name == github.repository" \
  "secret-backed preview deploys skip fork PRs"
require_fixed "$PREVIEW" \
  "bash scripts/ci/__tests__/dashboard-pages-policy.test.sh" \
  "preview runs the static deployment policy before upload"
require_fixed "$PREVIEW" \
  "bash scripts/ci/__tests__/dashboard-live-e2e-policy.test.sh" \
  "preview runs the live-journey policy before upload"
require_fixed "$PREVIEW" \
  "bash scripts/ci/__tests__/verify-dashboard-pages.test.sh" \
  "preview runs the SPA verifier self-test before upload"
require_fixed "$PREVIEW" \
  "bash scripts/ci/__tests__/ensure-dashboard-pages-project.test.sh" \
  "preview runs the Pages project bootstrap self-test before upload"
require_before "$PREVIEW" \
  "pnpm --filter @harpa/dashboard test" \
  "pnpm --filter @harpa/dashboard build" \
  "preview tests dashboard behavior before building"
require_fixed "$PREVIEW" \
  "pnpm --filter @harpa/dashboard exec playwright install --with-deps chromium firefox webkit msedge" \
  "preview installs all supported browser engines"
require_before "$PREVIEW" \
  "pnpm --filter @harpa/dashboard test:e2e" \
  "pnpm --filter @harpa/dashboard build" \
  "preview runs cross-browser journeys before building"

for workflow in "$PREVIEW" "$DEV" "$PROD"; do
  label="$(basename "$workflow")"
  require_fixed "$workflow" \
    'VITE_SENTRY_DSN: ${{ secrets.SENTRY_DASHBOARD_DSN }}' \
    "$label injects the optional dashboard Sentry DSN"
  require_fixed "$workflow" \
    'VITE_SENTRY_RELEASE: ${{ github.sha }}' \
    "$label tags dashboard telemetry with the deployed commit"
done

require_fixed "$DEV" \
  "VITE_API_BASE_URL: https://harpa-pro-api-dev.fly.dev" \
  "dev dashboard points at the dev API"
require_fixed "$DEV" \
  "--branch=dev" \
  "dev dashboard deploys to the stable dev branch alias"
require_fixed "$DEV" \
  "cancel-in-progress: true" \
  "stale dev deploys are cancellable"

require_fixed "$PROD" \
  "VITE_API_BASE_URL: https://api.harpapro.com" \
  "production dashboard points at the production API"
require_fixed "$PROD" \
  "--branch=main" \
  "production deploys from the configured Pages production branch"
require_fixed "$PROD" \
  "cancel-in-progress: false" \
  "production deploys are never cancelled mid-flight"

echo
echo "failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
