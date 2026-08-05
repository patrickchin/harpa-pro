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

require_dependabot_entry_fixed() {
  local path="$1" ecosystem="$2" needle="$3" description="$4"
  if [[ -f "$REPO_ROOT/$path" ]] && awk -v ecosystem="package-ecosystem: '$ecosystem'" -v needle="$needle" '
    index($0, ecosystem) {
      in_entry = 1
      found_entry = 1
      next
    }
    in_entry && index($0, "package-ecosystem:") {
      in_entry = 0
    }
    in_entry && index($0, needle) {
      found_setting = 1
    }
    END { exit found_entry && found_setting ? 0 : 1 }
  ' "$REPO_ROOT/$path"; then
    echo "  ok   - $description"
  else
    echo "  FAIL - $description"
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

require_command_success() {
  local description="$1"
  shift
  if "$@" >/dev/null; then
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

require_occurrence_before() {
  local path="$1" first="$2" first_occurrence="$3" second="$4" second_occurrence="$5" description="$6"
  local first_line second_line
  first_line="$(grep -nF -- "$first" "$REPO_ROOT/$path" | sed -n "${first_occurrence}p" | cut -d: -f1 || true)"
  second_line="$(grep -nF -- "$second" "$REPO_ROOT/$path" | sed -n "${second_occurrence}p" | cut -d: -f1 || true)"
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
require_fixed ".github/dependabot.yml" \
  "package-ecosystem: 'bundler'" \
  "Dependabot scans the root Bundler graph"
require_fixed_count ".github/dependabot.yml" \
  "package-ecosystem:" 3 \
  "Dependabot declares exactly the three intended ecosystems"
require_fixed_count ".github/dependabot.yml" \
  "target-branch: 'dev'" 3 \
  "all three routine dependency update entries target dev"
require_fixed_count ".github/dependabot.yml" \
  "interval: 'weekly'" 3 \
  "all three dependency update entries use a controlled weekly cadence"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "npm" "directory: '/'" \
  "npm updates scan the root pnpm workspace"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "npm" "target-branch: 'dev'" \
  "npm updates target dev"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "npm" "interval: 'weekly'" \
  "npm updates retain the weekly cadence"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "npm" "day: 'monday'" \
  "npm updates retain the Monday schedule"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "npm" "time: '09:00'" \
  "npm updates retain the 09:00 schedule"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "npm" "timezone: 'Asia/Shanghai'" \
  "npm updates retain the repository timezone"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "npm" "open-pull-requests-limit: 5" \
  "npm updates retain the five-PR limit"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "npm" "prefix: 'chore(deps)'" \
  "npm updates retain the dependency commit prefix"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "github-actions" "directory: '/'" \
  "GitHub Actions updates scan the root workflow graph"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "github-actions" "target-branch: 'dev'" \
  "GitHub Actions updates target dev"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "github-actions" "interval: 'weekly'" \
  "GitHub Actions updates retain the weekly cadence"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "github-actions" "day: 'tuesday'" \
  "GitHub Actions updates retain the Tuesday schedule"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "github-actions" "time: '09:00'" \
  "GitHub Actions updates retain the 09:00 schedule"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "github-actions" "timezone: 'Asia/Shanghai'" \
  "GitHub Actions updates retain the repository timezone"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "github-actions" "open-pull-requests-limit: 5" \
  "GitHub Actions updates retain the five-PR limit"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "github-actions" "prefix: 'chore(ci)'" \
  "GitHub Actions updates retain the CI commit prefix"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "bundler" "directory: '/'" \
  "Bundler updates scan the root Gemfile"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "bundler" "target-branch: 'dev'" \
  "Bundler updates target dev"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "bundler" "interval: 'weekly'" \
  "Bundler updates use the weekly cadence"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "bundler" "day: 'wednesday'" \
  "Bundler updates run on Wednesday"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "bundler" "time: '09:00'" \
  "Bundler updates retain the 09:00 schedule"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "bundler" "timezone: 'Asia/Shanghai'" \
  "Bundler updates use the repository timezone"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "bundler" "open-pull-requests-limit: 2" \
  "Bundler updates retain the two-PR limit"
require_dependabot_entry_fixed ".github/dependabot.yml" \
  "bundler" "prefix: 'chore(deps)'" \
  "Bundler updates retain the dependency commit prefix"
require_fixed ".github/dependabot.yml" \
  "production-patches:" \
  "unrelated production updates are grouped only at patch level"
require_fixed ".github/dependabot.yml" \
  "development-patches:" \
  "unrelated development updates are grouped only at patch level"
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
require_file "scripts/ci/__tests__/api-coverage-reporting-policy.test.cjs" \
  "API coverage reporter wiring has a structural policy test"
require_command_success \
  "every API coverage command keeps its required reporter contract" \
  node "$REPO_ROOT/scripts/ci/__tests__/api-coverage-reporting-policy.test.cjs"
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
require_fixed ".maestro/ci-launch-smoke.yaml" \
  "visible: 'Development Build'" \
  "Maestro waits for the Expo Dev Launcher before opening Metro"
require_fixed ".maestro/ci-launch-smoke.yaml" \
  'visible: "Quickstep isn'\''t responding|Development Build"' \
  "Maestro accepts the recoverable Quickstep dialog at launcher readiness"
require_fixed ".maestro/ci-launch-smoke.yaml" \
  'visible: "Quickstep isn'\''t responding|http://10.0.2.2:8081|Continue|Email"' \
  "Maestro observes late Quickstep interception during post-link loading"
require_fixed_count ".maestro/ci-launch-smoke.yaml" \
  'visible: "Quickstep isn'\''t responding"' 2 \
  "Maestro checks for the Quickstep dialog around both launcher transitions"
require_fixed_count ".maestro/ci-launch-smoke.yaml" \
  "- tapOn: 'Wait'" 2 \
  "Maestro recovers both Quickstep checks through the semantic Wait action"
forbid_fixed ".maestro/ci-launch-smoke.yaml" \
  "optional: true" \
  "Expo app-readiness wait fails closed"
require_adjacent_fixed ".maestro/ci-launch-smoke.yaml" \
  'visible: "Quickstep isn'\''t responding|Development Build"' \
  "timeout: 30000" \
  "launcher or Quickstep readiness remains bounded to 30 seconds"
require_adjacent_fixed ".maestro/ci-launch-smoke.yaml" \
  'visible: "Quickstep isn'\''t responding|http://10.0.2.2:8081|Continue|Email"' \
  "timeout: 90000" \
  "post-link launcher or app readiness retains the 90-second cold-bundle budget"
require_adjacent_fixed ".maestro/ci-launch-smoke.yaml" \
  "visible: 'Development Build'" \
  "timeout: 30000" \
  "Expo Dev Launcher readiness wait allows 30 seconds"
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
  "clearState: true" \
  'visible: "Quickstep isn'\''t responding|Development Build"' \
  "Maestro clears state before observing launcher or Quickstep readiness"
require_occurrence_before ".maestro/ci-launch-smoke.yaml" \
  'visible: "Quickstep isn'\''t responding"' 1 \
  "visible: 'Development Build'" 1 \
  "Maestro handles the initial Quickstep dialog before requiring the launcher"
require_before ".maestro/ci-launch-smoke.yaml" \
  "clearState: true" \
  "visible: 'Development Build'" \
  "Maestro clears state before waiting for the Expo Dev Launcher"
require_before ".maestro/ci-launch-smoke.yaml" \
  "visible: 'Development Build'" \
  "- openLink:" \
  "Maestro waits for the Expo Dev Launcher before opening Metro"
require_occurrence_before ".maestro/ci-launch-smoke.yaml" \
  "- openLink:" 1 \
  'visible: "Quickstep isn'\''t responding|http://10.0.2.2:8081|Continue|Email"' 1 \
  "Maestro starts bounded post-link observation after opening Metro"
require_occurrence_before ".maestro/ci-launch-smoke.yaml" \
  'visible: "Quickstep isn'\''t responding|http://10.0.2.2:8081|Continue|Email"' 1 \
  'visible: "Quickstep isn'\''t responding"' 2 \
  "Maestro observes late Quickstep before its second recovery action"
require_occurrence_before ".maestro/ci-launch-smoke.yaml" \
  "- openLink:" 1 \
  'visible: "Quickstep isn'\''t responding"' 2 \
  "Maestro checks for a second Quickstep dialog after opening Metro"
require_occurrence_before ".maestro/ci-launch-smoke.yaml" \
  "- tapOn: 'Wait'" 2 \
  "visible: 'http://10.0.2.2:8081'" 1 \
  "Maestro handles post-link Quickstep before selecting the Metro server"
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
  'timeout[[:space:]]+420s.*maestro' \
  "Maestro CLI execution budgets 420 seconds for bounded recovery"
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
