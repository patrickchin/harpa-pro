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

require_filter_fixed() {
  local path="$1" filter="$2" needle="$3" description="$4"
  if [[ -f "$REPO_ROOT/$path" ]] && awk -v header="          $filter:" -v needle="$needle" '
    {
      line = $0
      sub(/\r$/, "", line)
    }
    line == header {
      in_filter = 1
      next
    }
    in_filter && line ~ /^          [^[:space:]][^:]*:$/ {
      exit found ? 0 : 1
    }
    in_filter && index(line, needle) {
      found = 1
    }
    END { exit found ? 0 : 1 }
  ' "$REPO_ROOT/$path"; then
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

require_ordered_pair() {
  local path="$1" first="$2" second="$3" description="$4"
  if [[ -f "$REPO_ROOT/$path" ]] && awk -v first="$first" -v second="$second" '
    index($0, first) { saw_first = 1 }
    saw_first && index($0, second) { found = 1 }
    END { exit found ? 0 : 1 }
  ' "$REPO_ROOT/$path"; then
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

require_section_fixed() {
  local path="$1" start="$2" end="$3" needle="$4" description="$5"
  if [[ -f "$REPO_ROOT/$path" ]] && awk -v start="$start" -v end="$end" -v needle="$needle" '
    index($0, start) {
      in_section = 1
      next
    }
    in_section && index($0, end) {
      exit found ? 0 : 1
    }
    in_section && index($0, needle) {
      found = 1
    }
    END { exit found ? 0 : 1 }
  ' "$REPO_ROOT/$path"; then
    echo "  ok   - $description"
  else
    echo "  FAIL - $description"
    FAIL=$((FAIL + 1))
  fi
}

forbid_section_fixed() {
  local path="$1" start="$2" end="$3" needle="$4" description="$5"
  if [[ -f "$REPO_ROOT/$path" ]] && awk -v start="$start" -v end="$end" -v needle="$needle" '
    index($0, start) {
      in_section = 1
      next
    }
    in_section && index($0, end) {
      exit found ? 1 : 0
    }
    in_section && index($0, needle) {
      found = 1
    }
    END { exit found ? 1 : 0 }
  ' "$REPO_ROOT/$path"; then
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
  'actions/dependency-review-action@v[1-9][0-9]*[[:space:]]*$' \
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
  "visible: 'Continue|Close|Email'" \
  "Maestro waits for either Expo onboarding or rendered app UI"
require_fixed ".maestro/ci-launch-smoke.yaml" \
  "visible: 'Development Build'" \
  "Maestro waits for the Expo Dev Launcher before opening Metro"
require_fixed ".maestro/ci-launch-smoke.yaml" \
  'visible: "Quickstep isn'\''t responding|Development Build"' \
  "Maestro accepts the recoverable Quickstep dialog at launcher readiness"
require_fixed ".maestro/ci-launch-smoke.yaml" \
  'visible: "Quickstep isn'\''t responding|http://10.0.2.2:8081|Continue|Close|Email"' \
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
  'visible: "Quickstep isn'\''t responding|http://10.0.2.2:8081|Continue|Close|Email"' \
  "timeout: 90000" \
  "post-link launcher or app readiness retains the 90-second cold-bundle budget"
require_adjacent_fixed ".maestro/ci-launch-smoke.yaml" \
  "visible: 'Development Build'" \
  "timeout: 30000" \
  "Expo Dev Launcher readiness wait allows 30 seconds"
require_adjacent_fixed ".maestro/ci-launch-smoke.yaml" \
  "visible: 'Continue|Close|Email'" \
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
  'visible: "Quickstep isn'\''t responding|http://10.0.2.2:8081|Continue|Close|Email"' 1 \
  "Maestro starts bounded post-link observation after opening Metro"
require_occurrence_before ".maestro/ci-launch-smoke.yaml" \
  'visible: "Quickstep isn'\''t responding|http://10.0.2.2:8081|Continue|Close|Email"' 1 \
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
  "visible: 'Continue|Close|Email'" \
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

require_file ".maestro/helpers/launch-local-dev-client.yaml" \
  "local Maestro journeys share one dev-client launch helper"
require_fixed_count ".maestro/helpers/launch-local-dev-client.yaml" \
  "Continue|Close|Email" 4 \
  "local launch waits accept Expo's Continue and Close onboarding actions"
require_fixed ".maestro/helpers/launch-local-dev-client.yaml" \
  'visible: "Quickstep isn'\''t responding|Development Build|Continue|Close|Email"' \
  "local launch helper accepts recoverable Quickstep at native readiness"
require_adjacent_fixed ".maestro/helpers/launch-local-dev-client.yaml" \
  'visible: "Quickstep isn'\''t responding|Development Build|Continue|Close|Email"' \
  "timeout: 30000" \
  "local native-launcher readiness remains bounded to 30 seconds"
require_fixed ".maestro/helpers/launch-local-dev-client.yaml" \
  'visible: "Quickstep isn'\''t responding|http://10.0.2.2:8081|Continue|Close|Email"' \
  "local launch helper accepts recoverable Quickstep during post-link loading"
require_adjacent_fixed ".maestro/helpers/launch-local-dev-client.yaml" \
  'visible: "Quickstep isn'\''t responding|http://10.0.2.2:8081|Continue|Close|Email"' \
  "timeout: 180000" \
  "local post-link readiness allows a three-minute cache-empty bundle"
require_fixed_count ".maestro/helpers/launch-local-dev-client.yaml" \
  'visible: "Quickstep isn'\''t responding"' 2 \
  "local launch helper checks Quickstep around both launcher transitions"
require_fixed_count ".maestro/helpers/launch-local-dev-client.yaml" \
  "- tapOn: 'Wait'" 2 \
  "local launch helper recovers both Quickstep checks semantically"
forbid_fixed ".maestro/helpers/launch-local-dev-client.yaml" \
  "optional: true" \
  "local launch readiness remains fail-closed"
require_fixed ".maestro/helpers/launch-local-dev-client.yaml" \
  "visible: 'http://10.0.2.2:8081'" \
  "local launch helper detects the Android emulator Metro row"
require_fixed ".maestro/helpers/launch-local-dev-client.yaml" \
  "- tapOn: 'http://10.0.2.2:8081'" \
  "local launch helper selects the visible Android Metro row"
require_adjacent_fixed ".maestro/helpers/launch-local-dev-client.yaml" \
  "visible: 'Continue|Close|Email'" \
  "timeout: 180000" \
  "local post-selection readiness allows a three-minute cache-empty bundle"
require_adjacent_fixed ".maestro/helpers/launch-local-dev-client.yaml" \
  "id: 'input-email'" \
  "timeout: 90000" \
  "local final app-control wait retains its 90-second budget"
require_before ".maestro/helpers/launch-local-dev-client.yaml" \
  "clearState: true" \
  'visible: "Quickstep isn'\''t responding|Development Build|Continue|Close|Email"' \
  "local launch helper clears state before observing native readiness"
require_occurrence_before ".maestro/helpers/launch-local-dev-client.yaml" \
  'visible: "Quickstep isn'\''t responding"' 1 \
  "visible: 'Development Build|Continue|Close|Email'" 1 \
  "local launch helper handles initial Quickstep before strict readiness"
require_before ".maestro/helpers/launch-local-dev-client.yaml" \
  "visible: 'Development Build|Continue|Close|Email'" \
  "- openLink:" \
  "local launch helper waits for native readiness before opening Metro"
require_before ".maestro/helpers/launch-local-dev-client.yaml" \
  "- openLink:" \
  'visible: "Quickstep isn'\''t responding|http://10.0.2.2:8081|Continue|Close|Email"' \
  "local launch helper observes fallback state after opening Metro"
require_occurrence_before ".maestro/helpers/launch-local-dev-client.yaml" \
  'visible: "Quickstep isn'\''t responding|http://10.0.2.2:8081|Continue|Close|Email"' 1 \
  'visible: "Quickstep isn'\''t responding"' 2 \
  "local launch helper observes late Quickstep before recovering it"
require_before ".maestro/helpers/launch-local-dev-client.yaml" \
  "- tapOn: 'http://10.0.2.2:8081'" \
  "id: 'input-email'" \
  "local launch helper selects Metro before requiring app UI"
require_fixed ".maestro/modules/01-auth.yaml" \
  "- runFlow: ../helpers/launch-local-dev-client.yaml" \
  "modular local journeys use the shared dev-client launch helper"
require_fixed ".maestro/core-end-to-end.yaml" \
  "- runFlow: helpers/launch-local-dev-client.yaml" \
  "legacy core journey uses the shared dev-client launch helper"
require_fixed ".maestro/account-deletion.yaml" \
  "- runFlow: helpers/launch-local-dev-client.yaml" \
  "account-deletion journey uses the shared dev-client launch helper"
require_fixed ".maestro/store-screenshots.yaml" \
  "- runFlow: helpers/launch-local-dev-client.yaml" \
  "store screenshot flow uses the shared dev-client launch helper"
require_fixed ".maestro/helpers/wait-for-camera-shutter-ready.yaml" \
  "id: 'btn-camera-shutter'" \
  "camera readiness helper targets the semantic shutter control"
require_fixed ".maestro/helpers/wait-for-camera-shutter-ready.yaml" \
  "enabled: true" \
  "camera readiness helper waits for an enabled native shutter"
require_fixed_count ".maestro/modules/10a-photo-notes-draft.yaml" \
  "- runFlow: ../helpers/wait-for-camera-shutter-ready.yaml" 2 \
  "draft burst waits for stable camera readiness before both captures"
require_occurrence_before ".maestro/modules/10a-photo-notes-draft.yaml" \
  "- runFlow: ../helpers/wait-for-camera-shutter-ready.yaml" 1 \
  "id: 'btn-camera-shutter'" 1 \
  "draft burst readiness wait precedes its first capture"
require_occurrence_before ".maestro/modules/10a-photo-notes-draft.yaml" \
  "- runFlow: ../helpers/wait-for-camera-shutter-ready.yaml" 2 \
  "id: 'btn-camera-shutter'" 2 \
  "draft burst readiness wait precedes its second capture"
require_fixed_count ".maestro/modules/10b-photo-notes-finalized.yaml" \
  "- runFlow: ../helpers/wait-for-camera-shutter-ready.yaml" 2 \
  "finalized burst waits for stable camera readiness before both captures"
require_occurrence_before ".maestro/modules/10b-photo-notes-finalized.yaml" \
  "- runFlow: ../helpers/wait-for-camera-shutter-ready.yaml" 1 \
  "id: 'btn-camera-shutter'" 1 \
  "finalized burst readiness wait precedes its first capture"
require_occurrence_before ".maestro/modules/10b-photo-notes-finalized.yaml" \
  "- runFlow: ../helpers/wait-for-camera-shutter-ready.yaml" 2 \
  "id: 'btn-camera-shutter'" 2 \
  "finalized burst readiness wait precedes its second capture"
require_before ".maestro/modules/10b-photo-notes-finalized.yaml" \
  "id: 'btn-report-photo-.*'" \
  "id: 'report-photos-grid'" \
  "finalized photo verification scrolls to a leaf tile before asserting the nested grid"
require_fixed_count ".maestro/modules/10b-photo-notes-finalized.yaml" \
  "visibilityPercentage: 100" 2 \
  "finalized photo and cleanup targets require full visibility"
require_fixed_count ".maestro/modules/10b-photo-notes-finalized.yaml" \
  "centerElement: true" 2 \
  "finalized photo and cleanup targets are centered away from clipped viewport edges"
require_before ".maestro/store-screenshots.yaml" \
  "id: 'btn-report-photo-.*'" \
  "id: 'report-photos-grid'" \
  "store screenshot flow positions a bounded photo tile before the nested grid"
require_fixed_count ".maestro/store-screenshots.yaml" \
  "visibilityPercentage: 100" 1 \
  "store screenshot photo target requires full visibility"
require_fixed_count ".maestro/store-screenshots.yaml" \
  "centerElement: true" 1 \
  "store screenshot photo target is centered away from viewport clipping"
require_fixed_count ".maestro/helpers/capture-one-photo-note.yaml" \
  "- runFlow: wait-for-camera-shutter-ready.yaml" 1 \
  "shared single-photo capture waits for stable camera readiness"
require_before ".maestro/helpers/capture-one-photo-note.yaml" \
  "- runFlow: wait-for-camera-shutter-ready.yaml" \
  'id: "btn-camera-shutter"' \
  "shared single-photo readiness wait precedes capture"
require_adjacent_fixed ".maestro/helpers/capture-one-photo-note.yaml" \
  'id: "dialog-sheet"' \
  "timeout: 20000" \
  "shared capture allows the attachment sheet to render under regeneration load"
require_before ".maestro/helpers/capture-one-photo-note.yaml" \
  'id: "dialog-sheet"' \
  'id: "btn-attachment-camera"' \
  "shared capture waits for the attachment sheet before requiring its camera action"
require_fixed_count ".maestro/helpers/capture-one-photo-note.yaml" \
  "- runFlow: wait-for-auto-regeneration.yaml" 1 \
  "shared capture settles route-level regeneration before returning"
require_before ".maestro/helpers/capture-one-photo-note.yaml" \
  'id: "batch-grid-tile-0-ring"' \
  "- runFlow: wait-for-auto-regeneration.yaml" \
  "shared capture waits for upload completion before generation settlement"
require_fixed_count ".maestro/native-input-smoke.yaml" \
  "- runFlow: helpers/wait-for-camera-shutter-ready.yaml" 1 \
  "native camera smoke waits for stable camera readiness"
require_before ".maestro/native-input-smoke.yaml" \
  "- runFlow: helpers/wait-for-camera-shutter-ready.yaml" \
  'id: "btn-camera-shutter"' \
  "native camera smoke readiness wait precedes capture"
require_fixed "apps/mobile/screens/camera-capture.test.tsx" \
  "keeps the Android shutter disabled until picture-size rebinding is ready" \
  "camera readiness has Android picture-size rebind coverage"
require_fixed "apps/mobile/components/reports/generate/EditTabPane.tsx" \
  "collapsable={false}" \
  "generation opacity keeps a stable Fabric native host"
require_fixed "apps/mobile/screens/generate-edit-tab.test.tsx" \
  "keeps the edit form content as a native host across generation updates" \
  "edit-pane Fabric host stability has transition coverage"
require_fixed ".maestro/native-input-smoke.yaml" \
  "id: 'btn-project-edit|btn-new-project'" \
  "native-input cleanup accepts either valid post-delete navigation target"
require_before ".maestro/native-input-smoke.yaml" \
  "- runFlow: helpers/open-project.yaml" \
  "file: helpers/delete-current-project.yaml" \
  "native-input cleanup reopens the project before invoking project deletion"
require_fixed ".maestro/place-photo-on-issue.flow.yml" \
  "- runFlow: modules/01-auth.yaml" \
  "standalone photo-placement flow uses current local launch and email auth"
forbid_fixed ".maestro/place-photo-on-issue.flow.yml" \
  "id: 'input-phone'" \
  "standalone photo-placement flow does not use removed phone authentication"
require_fixed ".maestro/place-photo-on-issue.flow.yml" \
  "id: 'report-row-1'" \
  "standalone photo-placement flow opens the reset-db seeded report"
require_fixed ".maestro/place-photo-on-issue.flow.yml" \
  "id: 'project-row-prj_aaaaaaaaaaaa'" \
  "standalone photo-placement flow selects the reset-db project by stable id"
require_before ".maestro/place-photo-on-issue.flow.yml" \
  "- runFlow: helpers/wait-for-auto-regeneration.yaml" \
  "id: 'btn-generate-report-photos-place-.*'" \
  "photo placement waits for persisted generation before opening placement UI"
forbid_fixed ".maestro/place-photo-on-issue.flow.yml" \
  "visible: '^(Generate report|Update report)$'" \
  "photo placement does not race route-level auto-regeneration with a text-based tap"
require_file ".maestro/helpers/wait-for-auto-regeneration.yaml" \
  "photo journeys share one route-level auto-regeneration wait"
require_before ".maestro/helpers/wait-for-auto-regeneration.yaml" \
  "id: 'report-generation-current'" \
  "id: 'btn-finalize-report'" \
  "auto-regeneration observes current generation before finalized readiness"
require_before ".maestro/helpers/wait-for-auto-regeneration.yaml" \
  "id: 'btn-finalize-report'" \
  "enabled: true" \
  "auto-regeneration waits for an enabled finalized-ready action"
require_adjacent_fixed ".maestro/helpers/wait-for-auto-regeneration.yaml" \
  "enabled: true" \
  "timeout: 60000" \
  "auto-regeneration wait has a bounded finalized-ready assertion"
require_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "const [uploadSync, dispatchUploadSync] = useReducer(" \
  "generation synchronization tracks the local upload/refetch epoch"
require_file "apps/mobile/lib/reports/upload-sync-state.test.ts" \
  "overlapping and recoverable upload synchronization has unit coverage"
require_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "uploadSyncReducer," \
  "generate route tracks concurrent upload synchronization operations"
require_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "const handleRetryPhotoUpload = useCallback(" \
  "generate route owns failed-photo retry synchronization"
require_ordered_pair "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "await retry();" \
  "await invalidateAfterFileUpload(qc, { reportId });" \
  "failed-photo retry refetches canonical notes and report state"
require_fixed "apps/mobile/features/generate/GenerateReportProvider.tsx" \
  "onRetryPhotoUpload" \
  "photo-tile retry delegates to the route synchronization boundary"
require_fixed "apps/mobile/lib/uploads/usePhotoUploadEntries.ts" \
  "retry: (jobId: string) => Promise<void>;" \
  "photo upload retry exposes queue settlement to its caller"
require_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "getReportPhotoUploadQueueState(" \
  "generate readiness derives unresolved failures from the live upload queue"
require_fixed "apps/mobile/lib/reports/upload-sync-state.test.ts" \
  "keeps every failed job visible while another retry is pending or succeeds" \
  "multi-failure and concurrent-retry queue state has unit coverage"
require_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "const handleCancelPhotoUpload = useCallback(" \
  "generate route owns failed-photo dismissal synchronization"
require_fixed "apps/mobile/features/generate/GenerateReportProvider.tsx" \
  "onCancelPhotoUpload(cancel);" \
  "photo-tile cancellation delegates to the route synchronization boundary"
require_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "countNonCancelledUploadFailures(results)" \
  "intentional in-flight cancellation is not latched as an upload failure"
require_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "if (!isUploadCancellation(err))" \
  "cancelled inline retry does not relatch an upload error"
require_ordered_pair "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "await retry();" \
  "await invalidateAfterFileUpload(qc, { reportId });" \
  "inline retry cancellation still precedes canonical refetch"
require_fixed "apps/mobile/lib/uploads/cancel.test.ts" \
  "rejects a queued batch promise when remove() runs before that job starts" \
  "queued batch cancellation settlement has behavioral coverage"
require_fixed "apps/mobile/lib/uploads/queue.ts" \
  "if (wasPending) {" \
  "removed pending upload jobs settle without racing active collaborators"
require_fixed "apps/mobile/lib/uploads/queue.ts" \
  "remove: (jobId: string) => Promise<void>;" \
  "upload cancellation exposes active collaborator settlement"
require_ordered_pair "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "await cancel();" \
  "await invalidateAfterFileUpload(qc, { reportId });" \
  "direct photo cancellation settles before canonical refetch"
require_fixed "apps/mobile/lib/uploads/persistence.test.ts" \
  "noteId: 'not_xyz'" \
  "persisted completed uploads retain canonical note linkage"
require_fixed "apps/mobile/lib/reports/upload-sync-state.test.ts" \
  "releases a committed completed job after canonical refetch when its note is outside the visible page" \
  "paginated rehydrated completion readiness has unit coverage"
require_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "setRefetchedCompletedUploadIds" \
  "generate route acknowledges completed uploads only after refetch"
require_fixed "apps/mobile/lib/reports/upload-sync-state.ts" \
  "!job.noteId || !refetchedCompletedJobIds.has(job.id)" \
  "completed upload acknowledgment requires committed note linkage and refetch"
forbid_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "const refreshedNotes = qc.getQueryData" \
  "completed upload acknowledgment does not assume the note is in page one"
forbid_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "setUploadSyncPending(" \
  "generate route does not collapse concurrent uploads into one boolean latch"
require_fixed_count "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "await invalidateAfterFileUpload(qc, { reportId });" 5 \
  "gallery, camera, retry, cancel, and resumed uploads await note/report refetches"
require_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "reportGenerationStateTestId(" \
  "generate route derives a current-generation marker"
require_adjacent_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "uploadSyncPending," \
  "isGenerating: isGenerating || placePhotoGroupMutation.isPending," \
  "current-generation marker remains pending while its mutation settles"
require_adjacent_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "isGenerating: isGenerating || placePhotoGroupMutation.isPending," \
  "noteSyncPending," \
  "current-generation marker remains pending while notes settle"
require_adjacent_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "noteSyncPending," \
  "hasSyncError," \
  "current-generation marker fails closed on synchronization errors"
require_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "visibleNotes.some((note) => note.isPending)" \
  "generation synchronization observes optimistic note rows"
require_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "report.isFetching ||" \
  "generation synchronization observes report refetches"
require_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "notesQuery.isFetching;" \
  "generation synchronization observes notes refetches"
require_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "report.error != null ||" \
  "generation synchronization fails closed on query errors"
require_file "apps/mobile/lib/reports/generation-sync.test.ts" \
  "current-generation marker has unit coverage"
require_before ".maestro/helpers/assert-report-generation-write-lock.yaml" \
  "id: 'report-generation-current'" \
  "enabled: true" \
  "manual regeneration waits for the shared current-generation marker"
require_fixed ".maestro/core-end-to-end.yaml" \
  "- runFlow: helpers/wait-for-auto-regeneration.yaml" \
  "legacy core journey waits for route-level auto-regeneration"
require_before ".maestro/modules/08-text-notes.yaml" \
  "- runFlow: ../helpers/wait-for-auto-regeneration.yaml" \
  'id: "btn-note-options-.*"' \
  "text-note deletion waits for route-level auto-regeneration before opening row actions"
require_occurrence_before ".maestro/modules/08-text-notes.yaml" \
  'id: "note-row-.*"' 2 \
  "- runFlow: ../helpers/wait-for-auto-regeneration.yaml" 2 \
  "text-note cleanup observes deletion before waiting for regeneration"
require_occurrence_before ".maestro/modules/08-text-notes.yaml" \
  "- runFlow: ../helpers/wait-for-auto-regeneration.yaml" 2 \
  'id: "btn-draft-options"' 1 \
  "text-note cleanup waits for regeneration before opening draft actions"
require_before ".maestro/core-end-to-end.yaml" \
  "id: 'voice-title-.*'" \
  "- runFlow: helpers/wait-for-auto-regeneration.yaml" \
  "legacy core journey waits for provider-owned voice processing"
require_fixed ".maestro/modules/10a-photo-notes-draft.yaml" \
  "- runFlow: ../helpers/wait-for-auto-regeneration.yaml" \
  "draft photo journey waits for route-level auto-regeneration"
require_fixed ".maestro/modules/10b-photo-notes-finalized.yaml" \
  "- runFlow: ../helpers/wait-for-auto-regeneration.yaml" \
  "finalized photo journey waits for route-level auto-regeneration"
require_fixed ".maestro/modules/10c-photo-attachment-picker-scroll.yaml" \
  "- runFlow: ../helpers/wait-for-auto-regeneration.yaml" \
  "attachment-picker journey waits for route-level auto-regeneration"
require_fixed ".maestro/modules/11-generate-finalize.yaml" \
  "- runFlow: ../helpers/wait-for-auto-regeneration.yaml" \
  "generate/finalize regression waits for route-level auto-regeneration"
forbid_fixed ".maestro/modules/11-generate-finalize.yaml" \
  "id: 'btn-generate-.*report'" \
  "generate/finalize regression does not tap a transient generation action"
require_fixed ".maestro/modules/17-heavy-usage-stress.yaml" \
  "- runFlow: ../helpers/wait-for-auto-regeneration.yaml" \
  "heavy-usage stress waits for route-level auto-regeneration"
forbid_fixed ".maestro/modules/17-heavy-usage-stress.yaml" \
  "id: \"btn-generate-.*report\"" \
  "heavy-usage stress does not tap a transient generation action"
require_fixed ".maestro/place-photo-on-issue.flow.yml" \
  "- runFlow: helpers/wait-for-auto-regeneration.yaml" \
  "photo-placement journey waits for route-level auto-regeneration"
require_section_fixed ".maestro/helpers/edit-report-cards.yaml" \
  "# --- Workers" "# --- Materials" \
  "visibilityPercentage: 100" \
  "workers edit positioning requires the whole leaf action"
require_section_fixed ".maestro/helpers/edit-report-cards.yaml" \
  "# --- Workers" "# --- Materials" \
  "centerElement: false" \
  "workers edit positioning avoids Maestro's unbounded centering swipe"
forbid_section_fixed ".maestro/helpers/edit-report-cards.yaml" \
  "# --- Workers" "# --- Materials" \
  "centerElement: true" \
  "workers edit positioning cannot reintroduce unbounded centering"
require_section_fixed ".maestro/helpers/edit-report-cards.yaml" \
  "# --- Workers" "# --- Materials" \
  "start: 50%, 72%" \
  "workers edit uses a bounded upward positioning gesture"
require_section_fixed ".maestro/helpers/edit-report-cards.yaml" \
  "# --- Workers" "# --- Materials" \
  "end: 50%, 58%" \
  "workers edit bounds the upward positioning distance"
require_occurrence_before ".maestro/helpers/edit-report-cards.yaml" \
  "id: 'btn-edit-workers'" 1 \
  "start: 50%, 72%" 1 \
  "workers edit finds the leaf action before bounded positioning"
require_occurrence_before ".maestro/helpers/edit-report-cards.yaml" \
  "start: 50%, 72%" 1 \
  "id: 'btn-edit-workers'" 2 \
  "workers edit finishes bounded positioning before tapping"
require_section_fixed ".maestro/helpers/edit-report-cards.yaml" \
  "# --- Materials" "# --- Next steps" \
  "visibilityPercentage: 100" \
  "materials edit positioning requires the whole leaf action"
require_section_fixed ".maestro/helpers/edit-report-cards.yaml" \
  "# --- Materials" "# --- Next steps" \
  "centerElement: false" \
  "materials edit positioning avoids unbounded centering"
forbid_section_fixed ".maestro/helpers/edit-report-cards.yaml" \
  "# --- Materials" "# --- Next steps" \
  "centerElement: true" \
  "materials edit positioning cannot reintroduce unbounded centering"
require_section_fixed ".maestro/helpers/edit-report-cards.yaml" \
  "# --- Materials" "# --- Next steps" \
  "start: 50%, 72%" \
  "materials edit moves the clipped leaf above the sticky recorder"
require_section_fixed ".maestro/helpers/edit-report-cards.yaml" \
  "# --- Materials" "# --- Next steps" \
  "end: 50%, 58%" \
  "materials edit bounds its upward positioning distance"
require_occurrence_before ".maestro/helpers/edit-report-cards.yaml" \
  "id: 'btn-edit-materials'" 1 \
  "start: 50%, 72%" 2 \
  "materials edit finds the leaf action before bounded positioning"
require_occurrence_before ".maestro/helpers/edit-report-cards.yaml" \
  "start: 50%, 72%" 2 \
  "id: 'btn-edit-materials'" 2 \
  "materials edit finishes bounded positioning before tapping"
require_fixed_count ".maestro/helpers/edit-report-cards.yaml" \
  "text: 'E2E sealant.*'" 2 \
  "materials edit scrolls to the saved value before asserting it"
require_occurrence_before ".maestro/helpers/edit-report-cards.yaml" \
  "text: 'E2E sealant.*'" 1 \
  "text: 'E2E sealant.*'" 2 \
  "materials edit positions the saved value before its assertion"
require_fixed_count ".maestro/place-photo-on-issue.flow.yml" \
  "- runFlow: helpers/wait-for-auto-regeneration.yaml" 2 \
  "photo placement waits again after the optimistic placement write"
require_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "expectedUpdatedAtRef.current = response.report.updatedAt;" \
  "placement response advances the finalize body version synchronously"
require_fixed "apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx" \
  "const placementWriteBlocked = placePhotoGroupMutation.isPending || placementWriteError !== null;" \
  "placement settlement and failure block report actions"
require_fixed "apps/mobile/components/reports/generate/GenerateReportActionRow.tsx" \
  "isReportWriteBlocked: draft.isReportWriteBlocked" \
  "report action row observes unresolved placement writes"
require_file "apps/mobile/components/reports/generate/GenerateReportActionRow.test.ts" \
  "report action-row write blocking has unit coverage"
latest_local_migration="$(basename "$(find "$REPO_ROOT/packages/api/migrations" -maxdepth 1 -type f -name '*.sql' | sort | tail -n 1)")"
require_fixed_count "docker-compose.yml" \
  "MIGRATIONS_REQUIRED_HEAD: $latest_local_migration" 3 \
  "local Compose API, account seed, and storage worker pin the current migration head"
latest_local_admin_migration="$(basename "$(find "$REPO_ROOT/packages/api/admin-migrations" -maxdepth 1 -type f -name '*.sql' | sort | tail -n 1)")"
require_fixed_count "docker-compose.yml" \
  "ADMIN_MIGRATIONS_REQUIRED_HEAD: $latest_local_admin_migration" 3 \
  "local Compose API, account seed, and storage worker override the image's admin head"
require_fixed "docker-compose.yml" \
  "STORAGE_LEASE_ROLLOUT_GRACE_SEC: '0'" \
  "fresh local Compose stacks arm storage leases without a rolling-deploy grace"
require_fixed "docker-compose.yml" \
  "STORAGE_ACCOUNT_DELETE_ENABLED: 'true'" \
  "fresh local Compose stacks enable account deletion after migration"
require_section_fixed "docker-compose.yml" \
  "  storage-worker:" "  api:" \
  "migrate:" \
  "local storage worker waits for the migration one-shot"
require_section_fixed "docker-compose.yml" \
  "  storage-worker:" "  api:" \
  "minio-init:" \
  "local storage worker waits for the MinIO bucket"
require_section_fixed "docker-compose.yml" \
  "  storage-worker:" "  api:" \
  "R2_FIXTURE_MODE: live" \
  "local storage worker uses the same live MinIO backend as the API"
require_section_fixed "docker-compose.yml" \
  "  storage-worker:" "  api:" \
  "command: ['pnpm', '--filter', '@harpa/api', 'storage:worker']" \
  "local Compose runs the durable storage deletion worker"
require_section_fixed "docker-compose.yml" \
  "  storage-worker:" "  api:" \
  "restart: unless-stopped" \
  "local storage deletion retries survive worker process failures"
require_section_fixed "docker-compose.yml" \
  "  api:" "volumes:" \
  "storage-worker:" \
  "account-deletion API startup requires the local worker to start"
require_before "docker-compose.yml" \
  "pnpm --filter @harpa/api db:migrate &&" \
  "pnpm --filter @harpa/api storage:arm-leases" \
  "local Compose completes migrations before arming storage lifecycle"
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
require_filter_fixed ".github/actions/changed-paths/action.yml" \
  "mobile" \
  "'scripts/ci/run-maestro-launch-smoke.sh'" \
  "mobile path filtering includes the Maestro smoke runner"
require_filter_fixed ".github/actions/changed-paths/action.yml" \
  "mobile" \
  "'scripts/maestro/prepare-android-emulator.sh'" \
  "mobile path filtering includes the shared Android preflight"
require_filter_fixed ".github/actions/changed-paths/action.yml" \
  "mobile" \
  "'scripts/ci/__tests__/prepare-android-emulator.test.sh'" \
  "mobile path filtering includes Android preflight behavioral coverage"
require_fixed "scripts/ci/run-maestro-launch-smoke.sh" \
  "set -euo pipefail" \
  "Maestro smoke enables strict Bash handling"
require_file "scripts/maestro/prepare-android-emulator.sh" \
  "local and CI Maestro runs share an Android emulator preflight"
require_fixed "scripts/maestro/prepare-android-emulator.sh" \
  "shell getprop ro.kernel.qemu" \
  "Android preflight refuses to mutate physical devices"
require_fixed "scripts/maestro/prepare-android-emulator.sh" \
  "shell settings put global hide_error_dialogs 1" \
  "Android preflight suppresses system crash and ANR dialogs"
require_fixed "scripts/maestro/prepare-android-emulator.sh" \
  "shell settings get global hide_error_dialogs" \
  "Android preflight reads back error-dialog suppression"
# This is a literal preflight-script string, not a policy-test expansion.
# shellcheck disable=SC2016
require_fixed "scripts/maestro/prepare-android-emulator.sh" \
  'if [[ "$hide_error_dialogs" != "1" ]]; then' \
  "Android preflight fails closed when the setting is rejected"
require_before "scripts/maestro/prepare-android-emulator.sh" \
  "shell getprop ro.kernel.qemu" \
  "shell settings put global hide_error_dialogs 1" \
  "Android preflight verifies an emulator before changing global settings"
require_before "scripts/maestro/prepare-android-emulator.sh" \
  "shell settings put global hide_error_dialogs 1" \
  "shell settings get global hide_error_dialogs" \
  "Android preflight sets error-dialog suppression before verifying it"
require_file "scripts/ci/__tests__/prepare-android-emulator.test.sh" \
  "Android emulator preflight has fake-adb behavioral coverage"
require_fixed ".github/workflows/lint-typecheck.yml" \
  "bash scripts/ci/__tests__/prepare-android-emulator.test.sh" \
  "PR policy runs Android emulator preflight behavioral tests"
require_fixed ".github/workflows/lint-typecheck.yml" \
  "shellcheck scripts/maestro/prepare-android-emulator.sh" \
  "PR policy shellchecks the shared Android preflight"
require_fixed "scripts/ci/run-maestro-launch-smoke.sh" \
  "bash scripts/maestro/prepare-android-emulator.sh" \
  "Maestro smoke delegates Android setup to the shared preflight"
require_before "scripts/ci/run-maestro-launch-smoke.sh" \
  "bash scripts/maestro/prepare-android-emulator.sh" \
  "adb install -r" \
  "Maestro smoke verifies Android settings before installing the APK"
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
