#!/usr/bin/env bash
# Static policy tests for release-confidence CI gates.
#
# These assertions deliberately inspect the checked-in workflows/config
# instead of trying to execute GitHub Actions locally. Behavioural coverage
# for the deployed-SHA verifier lives beside this file.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
FAIL=0

require_file() {
  local path="$1" description="$2"
  if [[ -f "$REPO_ROOT/$path" ]]; then
    echo "  ok   - $description"
  else
    echo "  FAIL - $description (missing $path)"
    FAIL=$((FAIL + 1))
  fi
}

require_fixed() {
  local path="$1" needle="$2" description="$3"
  if [[ -f "$REPO_ROOT/$path" ]] && grep -Fq -- "$needle" "$REPO_ROOT/$path"; then
    echo "  ok   - $description"
  else
    echo "  FAIL - $description"
    FAIL=$((FAIL + 1))
  fi
}

require_regex() {
  local path="$1" pattern="$2" description="$3"
  if [[ -f "$REPO_ROOT/$path" ]] && grep -Eq -- "$pattern" "$REPO_ROOT/$path"; then
    echo "  ok   - $description"
  else
    echo "  FAIL - $description"
    FAIL=$((FAIL + 1))
  fi
}

require_before() {
  local path="$1" first="$2" second="$3" description="$4"
  local first_line second_line
  first_line="$(grep -nF -- "$first" "$REPO_ROOT/$path" | head -1 | cut -d: -f1 || true)"
  second_line="$(grep -nF -- "$second" "$REPO_ROOT/$path" | head -1 | cut -d: -f1 || true)"
  if [[ -n "$first_line" && -n "$second_line" && "$first_line" -lt "$second_line" ]]; then
    echo "  ok   - $description"
  else
    echo "  FAIL - $description"
    FAIL=$((FAIL + 1))
  fi
}

echo "release confidence gates"

require_file "packages/api/vitest.coverage.config.ts" \
  "API has a combined coverage configuration"
require_regex "packages/api/vitest.coverage.config.ts" \
  'thresholds:[[:space:]]*\{' \
  "API coverage configuration declares thresholds"
require_regex "packages/api/vitest.coverage.config.ts" \
  'lines:[[:space:]]*90' \
  "API line coverage threshold is 90 percent"
require_fixed "packages/api/package.json" '"test:coverage":' \
  "API exposes a coverage-gated test command"
require_fixed ".github/workflows/api-integration.yml" \
  "pnpm --filter @harpa/api test:coverage" \
  "API integration CI runs the coverage gate"
require_fixed ".github/workflows/api-integration.yml" \
  "permissions:" \
  "API integration workflow declares explicit permissions"
require_fixed ".github/workflows/api-integration.yml" \
  "contents: read" \
  "API integration workflow grants read-only repository access"

require_fixed ".github/workflows/e2e-maestro-testid-gate.yml" \
  "pnpm --filter @harpa/mobile bundle:smoke" \
  "mobile CI runs the Metro bundle leakage smoke"
require_fixed ".github/workflows/e2e-maestro-testid-gate.yml" \
  "permissions:" \
  "mobile confidence workflow declares explicit permissions"
require_fixed ".github/workflows/e2e-maestro-testid-gate.yml" \
  "contents: read" \
  "mobile confidence workflow grants read-only repository access"

require_file ".maestro/ci-launch-smoke.yaml" \
  "CI has a focused Maestro launch flow"
require_regex ".maestro/ci-launch-smoke.yaml" \
  "id:[[:space:]]*['\"]?input-email['\"]?" \
  "Maestro launch flow asserts a rendered app control"
require_regex ".github/workflows/e2e-maestro-testid-gate.yml" \
  'timeout-minutes:[[:space:]]*[0-9]+' \
  "Maestro job has a GitHub Actions timeout"
require_regex ".github/workflows/e2e-maestro-testid-gate.yml" \
  'android-emulator-runner|maestro start-device' \
  "Maestro smoke provisions a real Android emulator"
require_fixed ".github/workflows/e2e-maestro-testid-gate.yml" \
  "-PreactNativeArchitectures=x86_64" \
  "Android debug build targets only the emulator ABI"
require_regex ".github/workflows/e2e-maestro-testid-gate.yml" \
  'cache:[[:space:]]*gradle|gradle/actions/setup-gradle' \
  "Maestro smoke caches Gradle dependencies"
require_fixed ".github/workflows/e2e-maestro-testid-gate.yml" \
  "maestro\" test" \
  "Maestro CLI executes a real flow"
require_regex ".github/workflows/e2e-maestro-testid-gate.yml" \
  'timeout[[:space:]]+[0-9]+s.*maestro' \
  "Maestro CLI execution has a shell-level timeout"

# These are literal GitHub expression strings, not shell expansions.
# shellcheck disable=SC2016
require_fixed ".github/workflows/main-gate.yml" \
  'ref: ${{ github.event.pull_request.head.sha }}' \
  "main gate checks out the PR head SHA"
# shellcheck disable=SC2016
require_fixed ".github/workflows/main-gate.yml" \
  'EXPECTED_GIT_COMMIT: ${{ github.event.pull_request.head.sha }}' \
  "main gate declares the PR head as the expected deployment"
require_fixed ".github/workflows/main-gate.yml" \
  "bash scripts/ci/verify-deployed-sha.sh" \
  "main gate verifies the deployed SHA"
require_before ".github/workflows/main-gate.yml" \
  "Verify deployed dev SHA" "Run journeys against dev" \
  "deployed SHA is verified before journeys run"

require_fixed ".github/workflows/api-dev.yml" \
  "git rev-parse HEAD" \
  "dev deploy injects the full Git SHA"
require_fixed ".github/workflows/pr-preview.yml" \
  "git rev-parse HEAD" \
  "preview deploy injects the full Git SHA"
require_fixed "infra/fly/deploy.sh" \
  "git rev-parse HEAD" \
  "shared Fly deploy injects the full Git SHA"

require_fixed ".github/workflows/lint-typecheck.yml" \
  "bash scripts/ci/__tests__/release-confidence-gates.test.sh" \
  "static release-confidence policy runs on PRs"
require_fixed ".github/workflows/lint-typecheck.yml" \
  "bash scripts/ci/__tests__/verify-deployed-sha.test.sh" \
  "deployed-SHA verifier self-test runs on PRs"

echo
echo "failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
