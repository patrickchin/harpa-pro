#!/usr/bin/env bash
# Static policy tests for the dev/prod mobile OTA release chain.
#
# These workflows only run after merge, so a structural test is the cheapest
# way to keep their ordering contract PR-gated:
#   mobile-only push -> OTA directly
#   API + mobile push -> successful API deploy -> exact-SHA check -> OTA
#   appVersion change -> matching native build -> manual OTA dispatch
set -euo pipefail
# GitHub expressions below are intentionally literal static-test patterns.
# shellcheck disable=SC2016

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PASS=0
FAIL=0

pass() {
  echo "  ok   - $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "  FAIL - $1"
  FAIL=$((FAIL + 1))
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  local description="$3"

  if grep -Fq -- "$pattern" "$file"; then
    pass "$description"
  else
    fail "$description"
    echo "         missing '$pattern' in ${file#"$REPO_ROOT"/}"
  fi
}

assert_before() {
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
    echo "         expected '$first' before '$second' in ${file#"$REPO_ROOT"/}"
  fi
}

echo "mobile OTA release policy"

for environment in dev prod; do
  api_workflow="$REPO_ROOT/.github/workflows/api-${environment}.yml"
  ota_workflow="$REPO_ROOT/.github/workflows/mobile-ota-${environment}.yml"
  api_job="$environment"

  assert_contains \
    "$api_workflow" \
    "uses: ./.github/workflows/mobile-ota-${environment}.yml" \
    "${environment}: successful API workflow calls the reusable OTA workflow"
  assert_contains \
    "$api_workflow" \
    "needs: ${api_job}" \
    "${environment}: OTA call depends on the API deploy job"
  assert_contains \
    "$api_workflow" \
    'release_sha: ${{ github.sha }}' \
    "${environment}: API chain passes its exact push SHA"
  assert_contains \
    "$api_workflow" \
    "api_deploy_succeeded: true" \
    "${environment}: API chain marks the deploy gate satisfied"

  assert_contains \
    "$ota_workflow" \
    "workflow_call:" \
    "${environment}: OTA workflow is reusable by the API workflow"
  assert_contains \
    "$ota_workflow" \
    "native_runtime_ready:" \
    "${environment}: manual dispatch records native-runtime readiness"
  assert_contains \
    "$ota_workflow" \
    "runtime-changed:" \
    "${environment}: policy detects appVersion/runtime changes"
  assert_contains \
    "$ota_workflow" \
    "api-changed:" \
    "${environment}: policy distinguishes API-dependent releases"
  assert_contains \
    "$ota_workflow" \
    'ref: ${{ needs.release-policy.outputs.release-sha }}' \
    "${environment}: OTA checks out the policy-approved SHA"
  assert_contains \
    "$ota_workflow" \
    "bash scripts/ci/verify-api-release.sh" \
    "${environment}: API-dependent OTA verifies deployed release metadata"
  assert_contains \
    "$ota_workflow" \
    'EXPECTED_GIT_COMMIT: ${{ needs.release-policy.outputs.release-sha }}' \
    "${environment}: deployed metadata is compared with the OTA SHA"
  assert_before \
    "$ota_workflow" \
    "bash scripts/ci/verify-api-release.sh" \
    "eas update" \
    "${environment}: exact-SHA API verification precedes OTA publication"
done

VERSION_BUMP="$REPO_ROOT/.github/workflows/version-bump-dev.yml"
if [[ -e "$VERSION_BUMP" ]]; then
  fail "dev: appVersion is not bumped automatically on every merge"
  echo "         remove the automatic version-bump workflow"
else
  pass "dev: appVersion is not bumped automatically on every merge"
fi

VERIFY_SCRIPT="$REPO_ROOT/scripts/ci/verify-api-release.sh"
if [[ -f "$VERIFY_SCRIPT" ]]; then
  pass "shared API release verifier exists"
  assert_contains \
    "$VERIFY_SCRIPT" \
    'EXPECTED_GIT_COMMIT' \
    "API verifier requires the expected release SHA"
  assert_contains \
    "$VERIFY_SCRIPT" \
    'API_HEALTH_URL' \
    "API verifier reads health metadata"
  assert_contains \
    "$VERIFY_SCRIPT" \
    'verify-readyz.sh' \
    "API verifier also proves database readiness"
else
  fail "shared API release verifier exists"
  echo "         missing scripts/ci/verify-api-release.sh"
fi

echo
echo "passed: $PASS  failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
