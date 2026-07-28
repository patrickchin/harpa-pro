#!/usr/bin/env bash
# Production deployment policy regression test.
#
# As an operator, I want a guaranteed snapshot of production before Fly's
# release command applies migrations, so a bad migration always has a
# pre-change rollback point.
#
# Run directly:
#   bash scripts/ci/__tests__/api-prod-policy.test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WORKFLOW="$REPO_ROOT/.github/workflows/api-prod.yml"
FLY_CONFIG="$REPO_ROOT/infra/fly/fly.toml"

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

line_of() {
  local pattern="$1" file="$2"
  grep -n -m1 -F -- "$pattern" "$file" | cut -d: -f1
}

echo "api-prod production data-safety policy"

if grep -qF -- "pnpm --filter @harpa/api db:migrate" "$WORKFLOW"; then
  fail "workflow leaves migration application exclusively to Fly release_command"
else
  pass "workflow leaves migration application exclusively to Fly release_command"
fi

if grep -Eq '^[[:space:]]*release_command[[:space:]]*=.*db:migrate' "$FLY_CONFIG"; then
  pass "Fly release_command owns production migration application"
else
  fail "Fly release_command owns production migration application"
fi

snapshot_line="$(line_of "- name: Snapshot prod DB (pre-deploy)" "$WORKFLOW" || true)"
deploy_line="$(line_of "- name: Deploy to Fly.io" "$WORKFLOW" || true)"

if [[ -n "$snapshot_line" && -n "$deploy_line" && "$snapshot_line" -lt "$deploy_line" ]]; then
  pass "snapshot runs before the Fly deploy and its release command"
else
  fail "snapshot runs before the Fly deploy and its release command"
fi

if grep -qF -- "continue-on-error: true" "$WORKFLOW"; then
  fail "snapshot failure blocks production deployment"
else
  pass "snapshot failure blocks production deployment"
fi

if grep -qF -- "skipping pre-deploy snapshot" "$WORKFLOW"; then
  fail "missing snapshot credentials fail closed"
else
  pass "missing snapshot credentials fail closed"
fi

echo
echo "passed: $PASS  failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
