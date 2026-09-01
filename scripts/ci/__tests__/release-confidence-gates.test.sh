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

require_fixed_count() {
  local path="$1" needle="$2" expected="$3" description="$4"
  local actual=0
  if [[ -f "$REPO_ROOT/$path" ]]; then
    actual="$(grep -Fc -- "$needle" "$REPO_ROOT/$path" || true)"
  fi
  if [[ "$actual" -eq "$expected" ]]; then
    echo "  ok   - $description"
  else
    echo "  FAIL - $description (expected $expected, found $actual)"
    FAIL=$((FAIL + 1))
  fi
}

forbid_fixed() {
  local path="$1" needle="$2" description="$3"
  if [[ ! -f "$REPO_ROOT/$path" ]] || grep -Fq -- "$needle" "$REPO_ROOT/$path"; then
    echo "  FAIL - $description"
    FAIL=$((FAIL + 1))
  else
    echo "  ok   - $description"
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

require_adjacent_fixed() {
  local path="$1" first="$2" second="$3" description="$4"
  if [[ -f "$REPO_ROOT/$path" ]] && awk -v first="$first" -v second="$second" '
    index($0, first) {
      if ((getline following) > 0 && index(following, second)) {
        found = 1
      }
    }
    END { exit found ? 0 : 1 }
  ' "$REPO_ROOT/$path"; then
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

require_file ".github/dependabot.yml" \
  "Dependabot version-update policy is checked in"
require_fixed ".github/dependabot.yml" \
  "package-ecosystem: 'npm'" \
  "Dependabot scans the pnpm workspace through the npm ecosystem"
require_fixed ".github/dependabot.yml" \
  "package-ecosystem: 'github-actions'" \
  "Dependabot scans GitHub Actions"
require_fixed_count ".github/dependabot.yml" \
  "target-branch: 'dev'" 2 \
  "routine dependency updates target dev"
require_fixed_count ".github/dependabot.yml" \
  "interval: 'weekly'" 2 \
  "dependency update checks use a controlled weekly cadence"
require_fixed ".github/dependabot.yml" \
  "production-minor-patch:" \
  "production minor and patch updates are grouped"
require_fixed ".github/dependabot.yml" \
  "development-minor-patch:" \
  "development minor and patch updates are grouped"
forbid_fixed ".github/dependabot.yml" \
  "include: 'scope'" \
  "explicit conventional prefixes are not given a duplicate dependency scope"

require_file ".github/workflows/dependency-review.yml" \
  "pull requests have a dependency-review workflow"
require_regex ".github/workflows/dependency-review.yml" \
  'actions/dependency-review-action@v[1-9][0-9]*$' \
  "dependency review pins an explicit numeric action major"
require_fixed ".github/workflows/dependency-review.yml" \
  "fail-on-severity: high" \
  "dependency review rejects newly introduced high and critical vulnerabilities"
require_fixed ".github/workflows/dependency-review.yml" \
  "contents: read" \
  "dependency review keeps repository permissions read-only"

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
require_fixed ".maestro/ci-launch-smoke.yaml" \
  "visible: 'Continue|Email'" \
  "Maestro waits for either Expo onboarding or rendered app UI"
forbid_fixed ".maestro/ci-launch-smoke.yaml" \
  "optional: true" \
  "Expo app-readiness wait fails closed"
require_adjacent_fixed ".maestro/ci-launch-smoke.yaml" \
  "visible: 'Continue|Email'" \
  "timeout: 90000" \
  "fail-closed Expo app-readiness wait allows 90 seconds"
require_adjacent_fixed ".maestro/ci-launch-smoke.yaml" \
  "id: 'input-email'" \
  "timeout: 30000" \
  "final app-control wait remains 30 seconds"
require_fixed ".maestro/ci-launch-smoke.yaml" \
  "visible: 'http://10.0.2.2:8081'" \
  "Maestro launch flow detects the Android emulator's Metro server row"
require_before ".maestro/ci-launch-smoke.yaml" \
  "visible: 'http://10.0.2.2:8081'" \
  "id: 'input-email'" \
  "Maestro selects the available Metro server before asserting app UI"
require_before ".maestro/ci-launch-smoke.yaml" \
  "visible: 'http://10.0.2.2:8081'" \
  "visible: 'Continue|Email'" \
  "Maestro waits for app readiness only after selecting Metro"
require_before ".maestro/ci-launch-smoke.yaml" \
  "timeout: 90000" \
  "id: 'input-email'" \
  "bounded app-readiness wait precedes the app-control assertion"
require_before ".maestro/ci-launch-smoke.yaml" \
  "timeout: 30000" \
  "- assertVisible:" \
  "final app-control wait precedes its assertion"
require_adjacent_fixed ".maestro/ci-launch-smoke.yaml" \
  "- assertVisible:" \
  "id: 'input-email'" \
  "launch smoke finishes by asserting the rendered email control"
require_fixed ".github/workflows/e2e-maestro-testid-gate.yml" \
  "timeout-minutes: 30" \
  "Maestro job has a 30-minute GitHub Actions ceiling"
require_regex ".github/workflows/e2e-maestro-testid-gate.yml" \
  'android-emulator-runner|maestro start-device' \
  "Maestro smoke provisions a real Android emulator"
require_fixed ".github/workflows/e2e-maestro-testid-gate.yml" \
  'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' \
  "Ubuntu runner grants the documented KVM device permissions"
require_fixed ".github/workflows/e2e-maestro-testid-gate.yml" \
  "sudo udevadm control --reload-rules" \
  "KVM permission setup reloads udev rules"
require_fixed ".github/workflows/e2e-maestro-testid-gate.yml" \
  "sudo udevadm trigger --name-match=kvm" \
  "KVM permission setup applies the kvm rule"
require_before ".github/workflows/e2e-maestro-testid-gate.yml" \
  "sudo udevadm trigger --name-match=kvm" \
  "reactivecircus/android-emulator-runner@v2" \
  "KVM permissions are applied before the emulator starts"
require_fixed ".github/workflows/e2e-maestro-testid-gate.yml" \
  "emulator-boot-timeout: 300" \
  "Android emulator boot has a five-minute ceiling"
require_fixed ".github/workflows/e2e-maestro-testid-gate.yml" \
  "-PreactNativeArchitectures=x86_64" \
  "Android debug build targets only the emulator ABI"
require_regex ".github/workflows/e2e-maestro-testid-gate.yml" \
  'cache:[[:space:]]*gradle|gradle/actions/setup-gradle' \
  "Maestro smoke caches Gradle dependencies"
require_file "scripts/ci/run-maestro-launch-smoke.sh" \
  "Maestro smoke has a checked-in shell runner"
require_fixed ".github/workflows/e2e-maestro-testid-gate.yml" \
  "bash scripts/ci/run-maestro-launch-smoke.sh" \
  "Android emulator action invokes the Maestro smoke with Bash"
require_fixed "scripts/ci/run-maestro-launch-smoke.sh" \
  "set -euo pipefail" \
  "Maestro smoke enables strict Bash handling"
require_fixed "scripts/ci/run-maestro-launch-smoke.sh" \
  "maestro\" test" \
  "Maestro CLI executes a real flow"
require_regex "scripts/ci/run-maestro-launch-smoke.sh" \
  'timeout[[:space:]]+180s.*maestro' \
  "Maestro CLI execution keeps its 180-second shell timeout"
# These are literal runner-script strings, not policy-test expansions.
# shellcheck disable=SC2016
require_fixed "scripts/ci/run-maestro-launch-smoke.sh" \
  'mkdir -p "$MAESTRO_DEBUG_DIR"' \
  "Maestro smoke creates its diagnostics directory before launch"
# shellcheck disable=SC2016
require_fixed "scripts/ci/run-maestro-launch-smoke.sh" \
  ': > "$METRO_LOG"' \
  "Maestro smoke creates an uploadable log before fallible commands"
require_fixed ".github/workflows/e2e-maestro-testid-gate.yml" \
  "if-no-files-found: error" \
  "Maestro diagnostic upload fails if the runner produced no files"
require_fixed ".github/workflows/e2e-maestro-testid-gate.yml" \
  "include-hidden-files: true" \
  "Maestro diagnostic upload includes hidden UI hierarchy and screenshots"

# These are literal GitHub expression strings, not shell expansions.
# shellcheck disable=SC2016
require_fixed ".github/workflows/main-gate.yml" \
  'ref: ${{ github.event.pull_request.head.sha }}' \
  "main gate checks out the PR head SHA"
# shellcheck disable=SC2016
require_fixed ".github/workflows/main-gate.yml" \
  'EXPECTED_GIT_COMMIT: ${{ github.event.pull_request.head.sha }}' \
  "main gate declares the PR head as the expected deployment"
# shellcheck disable=SC2016
require_fixed ".github/workflows/main-gate.yml" \
  'HEAD_REF: ${{ github.event.pull_request.head.ref }}' \
  "main gate distinguishes dev promotions from focused hotfixes"
# shellcheck disable=SC2016
require_fixed ".github/workflows/main-gate.yml" \
  'PREVIEW_BASE_URL: https://harpa-pro-api-pr-${{ github.event.pull_request.number }}.fly.dev' \
  "main gate binds focused hotfixes to their exact-SHA preview"
# shellcheck disable=SC2016
require_fixed ".github/workflows/main-gate.yml" \
  'HEALTH_URL: ${{ steps.target.outputs.base_url }}/healthz' \
  "main gate verifies the selected exact-SHA deployment"
# shellcheck disable=SC2016
require_fixed ".github/workflows/main-gate.yml" \
  'bash scripts/journeys/all.sh "${{ steps.target.outputs.base_url }}"' \
  "main gate runs journeys against the selected exact-SHA deployment"
require_fixed ".github/workflows/main-gate.yml" \
  "actions: read" \
  "main gate can inspect preview workflow provenance"
require_fixed ".github/workflows/main-gate.yml" \
  "bash scripts/ci/wait-for-pr-preview.sh" \
  "main gate proves the preview job succeeded before using its URL"
require_fixed ".github/workflows/main-gate.yml" \
  "bash scripts/ci/verify-deployed-sha.sh" \
  "main gate verifies the deployed SHA"
require_before ".github/workflows/main-gate.yml" \
  "Resolve exact-SHA journey target" "Verify deployed SHA" \
  "main gate resolves its target before SHA verification"
require_before ".github/workflows/main-gate.yml" \
  "Wait for exact-SHA preview provenance" "Verify deployed SHA" \
  "preview provenance is proved before SHA verification"
require_before ".github/workflows/main-gate.yml" \
  "Verify deployed SHA" "Run journeys against verified target" \
  "deployed SHA is verified before journeys run"

require_fixed ".github/workflows/api-dev.yml" \
  "git rev-parse HEAD" \
  "dev deploy injects the full Git SHA"
require_fixed ".github/workflows/pr-preview.yml" \
  "git rev-parse HEAD" \
  "preview deploy injects the full Git SHA"
# shellcheck disable=SC2016
require_fixed ".github/workflows/pr-preview.yml" \
  'ref: ${{ github.event.pull_request.head.sha }}' \
  "preview deploy checks out the exact PR head SHA"
require_fixed "infra/fly/deploy.sh" \
  "git rev-parse HEAD" \
  "shared Fly deploy injects the full Git SHA"

require_fixed ".github/workflows/lint-typecheck.yml" \
  "bash scripts/ci/__tests__/release-confidence-gates.test.sh" \
  "static release-confidence policy runs on PRs"
require_fixed ".github/workflows/lint-typecheck.yml" \
  "bash scripts/ci/__tests__/verify-deployed-sha.test.sh" \
  "deployed-SHA verifier self-test runs on PRs"
require_fixed ".github/workflows/lint-typecheck.yml" \
  "bash scripts/ci/__tests__/wait-for-pr-preview.test.sh" \
  "preview provenance self-test runs on PRs"

echo
echo "failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
