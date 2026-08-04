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
  [[ -f "$file" ]] && pass "$description" || fail "$description"
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

echo "dashboard live E2E policy"

require_file "$LIVE_CONFIG" "live Playwright config exists"
require_file "$LIVE_SPEC" "live Playwright journey exists"
require_fixed "$PACKAGE" '"test:e2e:live": "playwright test --config=playwright.live.config.ts"' \
  "dashboard exposes a dedicated live E2E command"
require_fixed "$MOCK_CONFIG" "testIgnore: '**/live/**'" \
  "mock browser matrix excludes the cost-bearing live journey"

require_fixed "$LIVE_CONFIG" "workers: 1" "live calls run serially"
require_fixed "$LIVE_CONFIG" "retries: 0" "live AI calls are never double-billed by retries"
require_fixed "$LIVE_CONFIG" "trace: 'off'" "live traces cannot capture auth payloads"
require_fixed "$LIVE_CONFIG" "video: 'off'" "live video artifacts stay disabled"
forbid_fixed "$LIVE_CONFIG" "webServer:" "live config targets a deployed Pages build"

require_fixed "$LIVE_SPEC" "/reports/\${report.id}/notes" \
  "live journey seeds source text through the authenticated public API"
require_fixed "$LIVE_SPEC" "/projects/\${projectId}/reports/\${reportNumber}/debug" \
  "live journey reads persisted generation diagnostics"
require_fixed "$LIVE_SPEC" "fixtureMode).toBe('live')" \
  "live journey proves server-selected provider mode"
require_fixed "$LIVE_SPEC" "finally" "live journey has failure-path cleanup"

require_fixed "$CHANGED_PATHS" "dashboard:" "changed-paths publishes a dashboard output"
require_fixed "$CHANGED_PATHS" "- 'apps/dashboard/**'" \
  "dashboard changes activate isolated preview provisioning"
require_fixed "$PR_PREVIEW" "needs.changes.outputs.dashboard == 'true'" \
  "PR Fly and Neon previews include dashboard-only changes"
require_fixed "$FLY_PREVIEW" "db:seed-test-account" \
  "preview release seeds password-gated automation accounts"

require_fixed "$PREVIEW" 'https://harpa-pro-api-pr-${PR_NUMBER}.fly.dev' \
  "dashboard preview always selects its isolated PR API"
forbid_fixed "$PREVIEW" "https://harpa-pro-api-dev.fly.dev" \
  "live preview never mutates the shared dev backend"
require_fixed "$PREVIEW" "doppler secrets get DEMO_ACCOUNT_PASSWORD --plain" \
  "workflow loads only the server-owned demo password"
require_fixed "$PREVIEW" "pnpm --filter @harpa/dashboard test:e2e:live" \
  "workflow runs the deployed live journey"
require_fixed "$PREVIEW" 'DASHBOARD_LIVE_BASE_URL: ${{ steps.deploy.outputs.deployment-url }}' \
  "live journey targets the immutable Pages deployment"
require_fixed "$PREVIEW" 'DASHBOARD_LIVE_API_URL: ${{ steps.api.outputs.base-url }}' \
  "live setup targets the matching PR API"
require_before "$PREVIEW" "bash scripts/ci/verify-dashboard-pages.sh" \
  "pnpm --filter @harpa/dashboard test:e2e:live" \
  "deployed SPA verification precedes live journeys"

echo
echo "failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
