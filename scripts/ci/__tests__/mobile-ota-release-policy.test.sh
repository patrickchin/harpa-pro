#!/usr/bin/env bash
# Static policy tests for the dev/prod mobile OTA release chain.
#
# These workflows only run after merge, so a structural test is the cheapest
# way to keep their ordering contract PR-gated:
#   mobile-only push -> OTA directly
#   API + mobile push -> successful API deploy -> exact-SHA check -> OTA
#   appVersion change -> matching native build -> manual OTA dispatch
# GitHub expressions below are intentionally literal static-test patterns.
# shellcheck disable=SC2016
set -euo pipefail

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

assert_not_contains() {
  local file="$1"
  local pattern="$2"
  local description="$3"

  if grep -Fq -- "$pattern" "$file"; then
    fail "$description"
    echo "         unexpected '$pattern' in ${file#"$REPO_ROOT"/}"
  else
    pass "$description"
  fi
}

assert_count() {
  local file="$1"
  local pattern="$2"
  local expected="$3"
  local description="$4"
  local actual

  actual="$(grep -Fc -- "$pattern" "$file" || true)"
  if [[ "$actual" -eq "$expected" ]]; then
    pass "$description"
  else
    fail "$description"
    echo "         expected $expected occurrences of '$pattern', found $actual in ${file#"$REPO_ROOT"/}"
  fi
}

assert_job_contains() {
  local file="$1"
  local job="$2"
  local pattern="$3"
  local description="$4"
  local body

  body="$(
    awk -v header="  ${job}:" '
      $0 == header { in_job = 1 }
      in_job && $0 ~ /^  [^[:space:]][^:]*:$/ && $0 != header { exit }
      in_job { print }
    ' "$file"
  )"
  if grep -Fq -- "$pattern" <<<"$body"; then
    pass "$description"
  else
    fail "$description"
    echo "         missing '$pattern' in ${job} job of ${file#"$REPO_ROOT"/}"
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
  if [[ "$environment" == "dev" ]]; then
    runtime_tag="mobile-preview-runtime-v"
  else
    runtime_tag="mobile-production-runtime-v"
  fi

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
  assert_job_contains \
    "$api_workflow" \
    "mobile-ota" \
    "contents: write" \
    "${environment}: reusable OTA caller permits runtime-tag registration"
  assert_count \
    "$api_workflow" \
    "contents: write" \
    1 \
    "${environment}: only the reusable OTA caller can grant write scope"

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
    "native_artifact:" \
    "${environment}: runtime registration records the distributed artifact"
  assert_contains \
    "$ota_workflow" \
    "register-native-runtime:" \
    "${environment}: native readiness is a separate manual registration job"
  assert_contains \
    "$ota_workflow" \
    "contents: write" \
    "${environment}: only the registration job can create its runtime tag"
  assert_count \
    "$ota_workflow" \
    "contents: write" \
    1 \
    "${environment}: registration is the only called job with write scope"
  assert_count \
    "$ota_workflow" \
    "contents: read" \
    1 \
    "${environment}: called workflow defaults non-registration jobs to read-only"
  assert_before \
    "$ota_workflow" \
    "contents: read" \
    "jobs:" \
    "${environment}: read-only default applies before called jobs are defined"
  assert_contains \
    "$ota_workflow" \
    "$runtime_tag" \
    "${environment}: readiness tag is scoped by environment and appVersion"
  assert_contains \
    "$ota_workflow" \
    "needs: register-native-runtime" \
    "${environment}: release policy waits for manual runtime registration"
  assert_contains \
    "$ota_workflow" \
    "runtime-ready:" \
    "${environment}: every OTA requires the registered native runtime"
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
  assert_not_contains \
    "$ota_workflow" \
    "if: needs.release-policy.outputs.api-changed == 'true'" \
    "${environment}: every OTA verifies the deployed API"
  assert_count \
    "$ota_workflow" \
    "fetch-depth: 0" \
    3 \
    "${environment}: OTA verification has full branch history"
  assert_count \
    "$ota_workflow" \
    "API_PATH_PATTERN:" \
    2 \
    "${environment}: API history verifier receives the API path policy"
  assert_before \
    "$ota_workflow" \
    "register-native-runtime:" \
    "eas update" \
    "${environment}: native artifact registration precedes OTA publication"
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
  assert_contains \
    "$VERIFY_SCRIPT" \
    'API_PATH_PATTERN' \
    "API verifier receives the API path policy"
  assert_contains \
    "$VERIFY_SCRIPT" \
    'git merge-base --is-ancestor' \
    "API verifier accepts only an ancestor deployment"
  assert_contains \
    "$VERIFY_SCRIPT" \
    'git log --format= --name-only' \
    "API verifier inspects the full commit range for API changes"
else
  fail "shared API release verifier exists"
  echo "         missing scripts/ci/verify-api-release.sh"
fi

REGISTER_SCRIPT="$REPO_ROOT/scripts/ci/register-native-runtime.sh"
RESOLVE_SCRIPT="$REPO_ROOT/scripts/ci/resolve-mobile-ota-release.sh"
if [[ -f "$REGISTER_SCRIPT" && -f "$RESOLVE_SCRIPT" ]]; then
  pass "shared native registration and OTA policy helpers exist"
  assert_contains \
    "$REGISTER_SCRIPT" \
    'git tag -a' \
    "native registration creates an annotated readiness tag"
  assert_contains \
    "$REGISTER_SCRIPT" \
    'Artifact: $ARTIFACT' \
    "native readiness tag records the distributed artifact"
  assert_contains \
    "$RESOLVE_SCRIPT" \
    'pnpm-lock\.yaml$' \
    "lockfile changes invalidate native runtime readiness"
  assert_contains \
    "$RESOLVE_SCRIPT" \
    'patches/' \
    "repository patch changes invalidate native runtime readiness"
else
  fail "shared native registration and OTA policy helpers exist"
  echo "         missing native runtime release helper"
fi

echo
echo "passed: $PASS  failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
