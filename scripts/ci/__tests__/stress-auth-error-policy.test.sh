#!/usr/bin/env bash
# Stress-journey authentication error contract regression test.
#
# As a release verifier, I want the post-deploy journey to accept the API's
# reviewed empty-body response while retaining the distinct malformed-JSON
# contract, so correct 400 responses do not make dev deployments look broken.
#
# Run directly:
#   bash scripts/ci/__tests__/stress-auth-error-policy.test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
STRESS_JOURNEY="$REPO_ROOT/scripts/journeys/stress.sh"
LINT_WORKFLOW="$REPO_ROOT/.github/workflows/lint-typecheck.yml"

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

expect_statuses() {
  local label="$1" expected="$2"
  local line
  line=$(grep -F "check \"$label\"" "$STRESS_JOURNEY" || true)

  if [[ "$line" == *"\"$expected\""* ]]; then
    pass "$label accepts $expected"
  else
    fail "$label must accept $expected (found: ${line:-missing})"
  fi
}

echo "stress journey authentication error policy"

expect_statuses "empty body" "400|429"
expect_statuses "malformed JSON" "400|429"

if grep -Fq 'bash scripts/ci/__tests__/stress-auth-error-policy.test.sh' "$LINT_WORKFLOW"; then
  pass "lint-typecheck runs the auth error policy"
else
  fail "lint-typecheck must run the auth error policy"
fi

echo
echo "passed: $PASS  failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
