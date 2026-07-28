#!/usr/bin/env bash
# Tests cross-push API safety for scripts/ci/verify-api-release.sh.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/ci/verify-api-release.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
REPO="$TMP/repo"
HEALTH="$TMP/health.json"
READY="$TMP/ready.json"

pass() {
  echo "  ok   - $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "  FAIL - $1"
  FAIL=$((FAIL + 1))
}

assert_pass() {
  local name="$1"
  local log="$2"
  shift 2

  if "$@" >"$log" 2>&1; then
    pass "$name"
  else
    fail "$name"
    sed 's/^/         /' "$log"
  fi
}

assert_fail() {
  local name="$1"
  local log="$2"
  shift 2

  if "$@" >"$log" 2>&1; then
    fail "$name"
    echo "         expected a non-zero exit"
  else
    pass "$name"
  fi
}

set_health_sha() {
  printf '{"gitCommit":"%s"}\n' "$1" >"$HEALTH"
}

verify_release() {
  local expected="$1"
  local ready_url="${2:-file://$READY}"

  (
    cd "$REPO"
    API_HEALTH_URL="file://$HEALTH" \
      API_READY_URL="$ready_url" \
      API_PATH_PATTERN='^(packages/api/|packages/api-contract/)' \
      EXPECTED_GIT_COMMIT="$expected" \
      API_RELEASE_ATTEMPTS=1 \
      API_RELEASE_TIMEOUT=1 \
      API_RELEASE_SLEEP=0 \
      READYZ_ATTEMPTS=1 \
      READYZ_TIMEOUT=1 \
      READYZ_SLEEP=0 \
      bash "$SCRIPT"
  )
}

git init -q -b main "$REPO"
git -C "$REPO" config user.email test@example.com
git -C "$REPO" config user.name "CI test"
mkdir -p "$REPO/apps/mobile" "$REPO/packages/api-contract"
printf 'base\n' >"$REPO/apps/mobile/app.ts"
printf 'base\n' >"$REPO/packages/api-contract/schema.ts"
git -C "$REPO" add .
git -C "$REPO" commit -qm "base release"
BASE_SHA="$(git -C "$REPO" rev-parse HEAD)"

printf 'mobile one\n' >"$REPO/apps/mobile/app.ts"
git -C "$REPO" add .
git -C "$REPO" commit -qm "mobile only"
MOBILE_SHA="$(git -C "$REPO" rev-parse HEAD)"

printf 'mobile expects new contract\n' >"$REPO/apps/mobile/app.ts"
printf 'new contract\n' >"$REPO/packages/api-contract/schema.ts"
git -C "$REPO" add .
git -C "$REPO" commit -qm "api and mobile"
API_MOBILE_SHA="$(git -C "$REPO" rev-parse HEAD)"

printf 'mobile follow-up\n' >"$REPO/apps/mobile/app.ts"
git -C "$REPO" add .
git -C "$REPO" commit -qm "later mobile only"
RELEASE_SHA="$(git -C "$REPO" rev-parse HEAD)"

git -C "$REPO" switch -q -c divergent "$BASE_SHA"
printf 'divergent mobile\n' >"$REPO/apps/mobile/app.ts"
git -C "$REPO" add .
git -C "$REPO" commit -qm "divergent release"
DIVERGENT_SHA="$(git -C "$REPO" rev-parse HEAD)"
git -C "$REPO" switch -q main

printf '{"ok":true}\n' >"$READY"

echo "verify-api-release.sh"

set_health_sha "${RELEASE_SHA:0:12}"
assert_pass \
  "accepts the exact deployed release" \
  "$TMP/exact.log" \
  verify_release "$RELEASE_SHA"

set_health_sha "${BASE_SHA:0:12}"
assert_pass \
  "accepts an ancestor across mobile-only commits" \
  "$TMP/mobile-only.log" \
  verify_release "$MOBILE_SHA"

set_health_sha "${MOBILE_SHA:0:12}"
assert_fail \
  "rejects stale API after a failed API-and-mobile deploy" \
  "$TMP/stale-api.log" \
  verify_release "$RELEASE_SHA"
if grep -Fq "API inputs changed" "$TMP/stale-api.log"; then
  pass "explains why the stale API is unsafe"
else
  fail "explains why the stale API is unsafe"
fi

set_health_sha "${DIVERGENT_SHA:0:12}"
assert_fail \
  "rejects a deployed SHA outside the release ancestry" \
  "$TMP/divergent.log" \
  verify_release "$API_MOBILE_SHA"

set_health_sha "${BASE_SHA:0:12}"
assert_fail \
  "still requires readiness for an allowed ancestor" \
  "$TMP/readiness.log" \
  verify_release "$MOBILE_SHA" "file://$TMP/missing-readyz"

echo
echo "passed: $PASS  failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
