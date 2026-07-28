#!/usr/bin/env bash
# Stress-journey viewer authorization regression test.
#
# As a project viewer, I want project metadata mutations rejected without
# revealing whether the project exists, so my role remains read-only and the
# API preserves its reviewed 404 contract.
#
# Run directly:
#   bash scripts/ci/__tests__/stress-viewer-policy.test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
STRESS_JOURNEY="$REPO_ROOT/scripts/journeys/stress.sh"

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

echo "stress journey viewer authorization policy"

if grep -Eq \
  'check "viewer: PATCH project[^"]*" 404 PATCH "/projects/\$PID_A"' \
  "$STRESS_JOURNEY"; then
  pass "viewer project rename expects the read-only 404 contract"
else
  fail "viewer project rename expects the read-only 404 contract"
fi

if grep -Eq \
  'check "viewer: PATCH project[^"]*" 200 PATCH "/projects/\$PID_A"' \
  "$STRESS_JOURNEY"; then
  fail "journey contains no stale viewer project PATCH success expectation"
else
  pass "journey contains no stale viewer project PATCH success expectation"
fi

echo
echo "passed: $PASS  failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
