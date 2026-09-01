#!/usr/bin/env bash
# Static policy for the dashboard's isolated deployed-preview Playwright gate.
# shellcheck disable=SC2016
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PREVIEW="$REPO_ROOT/.github/workflows/dashboard-preview.yml"
PR_PREVIEW="$REPO_ROOT/.github/workflows/pr-preview.yml"
CHANGED_PATHS="$REPO_ROOT/.github/actions/changed-paths/action.yml"
FLY_PREVIEW="$REPO_ROOT/infra/fly/fly.preview.toml"
PACKAGE="$REPO_ROOT/apps/dashboard/package.json"
MOCK_CONFIG="$REPO_ROOT/apps/dashboard/playwright.config.ts"
LIVE_CONFIG="$REPO_ROOT/apps/dashboard/playwright.live.config.ts"
LIVE_SPEC="$REPO_ROOT/apps/dashboard/e2e/live/dashboard-live.spec.ts"
FAIL=0

pass() { echo "  ok   - $1"; }
fail() { echo "  FAIL - $1"; FAIL=$((FAIL + 1)); }

require_file() {
  local file="$1" description="$2"
  if [[ -f "$file" ]]; then
    pass "$description"
  else
    fail "$description"
  fi
}

require_fixed() {
  local file="$1" needle="$2" description="$3"
  if [[ -f "$file" ]] && grep -Fq -- "$needle" "$file"; then
    pass "$description"
  else
    fail "$description"
  fi
}

forbid_fixed() {
  local file="$1" needle="$2" description="$3"
  if [[ -f "$file" ]] && ! grep -Fq -- "$needle" "$file"; then
    pass "$description"
  else
    fail "$description"
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

require_count() {
  local file="$1" needle="$2" expected="$3" description="$4" actual
  actual="$(grep -Fc -- "$needle" "$file" || true)"
  if [[ "$actual" -eq "$expected" ]]; then
    pass "$description"
  else
    fail "$description (expected $expected, found $actual)"
  fi
}

echo "dashboard live E2E policy"

require_file "$LIVE_CONFIG" "live Playwright config exists"
require_file "$LIVE_SPEC" "live Playwright journey exists"
require_fixed "$PACKAGE" '"test:e2e:live": "playwright test --config=playwright.live.config.ts"' \
  "dashboard exposes a dedicated live E2E command"
require_fixed "$MOCK_CONFIG" "testIgnore: ['**/live/**']" \
  "mock browser matrix excludes the cost-bearing live journey"

require_fixed "$LIVE_CONFIG" "workers: 1" "live calls run serially"
require_fixed "$LIVE_CONFIG" "retries: 0" "live AI calls are never double-billed by retries"
require_fixed "$LIVE_CONFIG" "trace: 'off'" "live traces cannot capture auth payloads"
require_fixed "$LIVE_CONFIG" "video: 'off'" "live video artifacts stay disabled"
forbid_fixed "$LIVE_CONFIG" "webServer:" "live config targets a deployed Pages build"
forbid_fixed "$LIVE_CONFIG" "storageState" "live auth state is never persisted"
forbid_fixed "$LIVE_CONFIG" "html" "live reports cannot retain secret-bearing steps"

require_fixed "$LIVE_SPEC" "/reports/\${encodeURIComponent(reportId)}/notes" \
  "live journey seeds source text through the authenticated public API"
require_fixed "$LIVE_SPEC" "async function getReportDebug" \
  "live journey reads persisted generation diagnostics"
require_fixed "$LIVE_SPEC" "expect(reportDebug.lastGeneration?.fixtureMode).toBe('live')" \
  "live journey proves server-selected provider mode"
require_fixed "$LIVE_SPEC" "finally" "live journey has failure-path cleanup"
require_fixed "$LIVE_SPEC" "data: {}," \
  "live session cleanup sends the required JSON content type"
require_fixed "$LIVE_SPEC" "headers: { ...authHeaders(token), origin: dashboardOrigin }," \
  "live session cleanup sends the trusted dashboard Origin"
require_count "$LIVE_SPEC" "await revokeSession(request" 4 \
  "successful and failure paths both exercise direct session revocation"
require_fixed "$LIVE_SPEC" "This report changed on another device" \
  "live journey protects concurrent keyboard edits"
require_fixed "$LIVE_SPEC" "await expect(reviewComposer).toHaveValue('');" \
  "live journey waits for the review mutation to clear its composer"
require_fixed "$LIVE_SPEC" "getByRole('article').filter({ hasText: reviewComment })" \
  "live journey proves the saved comment before reopening the report"
require_fixed "$LIVE_SPEC" "Confirm removal" \
  "live journey proves removed-member access loss"
require_fixed "$LIVE_SPEC" "Reopen as draft" \
  "live journey covers finalized report reopening"
require_fixed "$LIVE_SPEC" "signOutThroughUi" \
  "live journey signs both browser sessions out"
require_fixed "$LIVE_SPEC" "getByRole('button', { name: 'Sign in' }).click()" \
  "live journey submits the deployed dashboard password form"
forbid_fixed "$LIVE_SPEC" "page.evaluate(" \
  "live authentication cannot bypass the dashboard UI"

require_fixed "$CHANGED_PATHS" "dashboard:" "changed-paths publishes a dashboard output"
require_fixed "$CHANGED_PATHS" "- 'apps/dashboard/**'" \
  "dashboard changes activate isolated preview provisioning"
require_fixed "$CHANGED_PATHS" "- '.github/workflows/pages-preview-ref.yml'" \
  "preview-ref changes activate isolated preview provisioning"
require_fixed "$CHANGED_PATHS" "- 'scripts/ci/build-cloudflare-pages.sh'" \
  "Cloudflare dashboard builder changes activate preview provisioning"
require_fixed "$CHANGED_PATHS" "- 'scripts/ci/verify-pages-deployment.sh'" \
  "exact-SHA verifier changes activate preview provisioning"
require_fixed "$PR_PREVIEW" "needs.changes.outputs.dashboard == 'true'" \
  "PR Fly and Neon previews include dashboard-only changes"
require_fixed "$FLY_PREVIEW" "db:seed-test-account" \
  "preview release seeds password-gated automation accounts"

require_fixed "$PREVIEW" 'API_PREVIEW_ORIGIN: https://harpa-pro-api-pr-${{ github.event.pull_request.number }}.fly.dev' \
  "dashboard preview always selects its isolated PR API"
forbid_fixed "$PREVIEW" "https://harpa-pro-api-dev.fly.dev" \
  "live preview never mutates the shared dev backend"
require_fixed "$PREVIEW" "doppler secrets get TEST_ACCOUNT_PASSWORD --plain" \
  "workflow loads only the server-owned test password"
require_fixed "$PREVIEW" 'DASHBOARD_LIVE_OWNER_EMAIL: ${{ vars.TEST_ACCOUNT_EMAIL_DEV }}' \
  "owner identity follows the seeded test-account allowlist"
require_fixed "$PREVIEW" 'DASHBOARD_LIVE_EDITOR_EMAIL: ${{ vars.TEST_ACCOUNT_EMAIL2_DEV }}' \
  "editor identity follows the seeded test-account allowlist"
require_fixed "$PREVIEW" "VITE_PASSWORD_ACCOUNT_EMAILS:" \
  "preview build exposes only the public password-account identities"
require_fixed "$PREVIEW" ".github/workflows/pages-preview-ref.yml" \
  "preview-ref changes trigger the dashboard gate"
require_fixed "$PREVIEW" "scripts/ci/build-cloudflare-pages.sh" \
  "Cloudflare build-wrapper changes trigger the dashboard gate"
require_fixed "$PREVIEW" "scripts/ci/verify-pages-deployment.sh" \
  "exact-SHA verifier changes trigger the dashboard gate"
require_fixed "$PREVIEW" "- '.github/actions/setup-monorepo/**'" \
  "shared monorepo setup changes trigger the dashboard gate"
require_fixed "$PREVIEW" "- 'scripts/ci/verify-api-release.sh'" \
  "API compatibility verifier changes trigger the dashboard gate"
require_fixed "$PREVIEW" "pnpm --filter @harpa/dashboard test:e2e:live" \
  "workflow runs the deployed live journey"
require_fixed "$PREVIEW" 'DASHBOARD_LIVE_BASE_URL: ${{ env.DASHBOARD_PREVIEW_ORIGIN }}' \
  "live journey targets the exact verified stable Pages alias"
require_fixed "$PREVIEW" 'DASHBOARD_LIVE_API_URL: ${{ env.API_PREVIEW_ORIGIN }}' \
  "live setup targets the matching PR API"
require_fixed "$PREVIEW" 'EXPECTED_GIT_COMMIT: ${{ github.event.pull_request.head.sha }}' \
  "Fly verification uses the immutable pull-request head SHA"
require_fixed "$PREVIEW" '--commit "${{ github.event.pull_request.head.sha }}"' \
  "Pages verification uses the mirrored pull-request head SHA"
require_fixed "$PREVIEW" 'DASHBOARD_URL: ${{ env.DASHBOARD_PREVIEW_ORIGIN }}' \
  "SPA verification uses the stable Pages alias"
require_before "$PREVIEW" "bash scripts/ci/verify-dashboard-pages.sh" \
  "pnpm --filter @harpa/dashboard test:e2e:live" \
  "deployed SPA verification precedes live journeys"

echo
echo "failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
