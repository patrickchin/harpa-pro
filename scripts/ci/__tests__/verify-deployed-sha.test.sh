#!/usr/bin/env bash
# Behaviour tests for scripts/ci/verify-deployed-sha.sh.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/ci/verify-deployed-sha.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0

if [[ ! -f "$SCRIPT" ]]; then
  echo "FAIL: missing scripts/ci/verify-deployed-sha.sh" >&2
  exit 1
fi

FAKE_BIN="$TMP/bin"
mkdir -p "$FAKE_BIN"
# The fake curl script is intentionally written as a literal.
# shellcheck disable=SC2016
printf '%s\n' '#!/usr/bin/env bash
set -euo pipefail
count=0
if [[ -f "$FAKE_CURL_COUNT" ]]; then
  count="$(cat "$FAKE_CURL_COUNT")"
fi
count=$((count + 1))
printf "%s" "$count" >"$FAKE_CURL_COUNT"
IFS="|" read -r -a responses <<<"$FAKE_CURL_RESPONSES"
index=$((count - 1))
if [[ "$index" -ge "${#responses[@]}" ]]; then
  index=$((${#responses[@]} - 1))
fi
printf "%s" "${responses[$index]}"' >"$FAKE_BIN/curl"
chmod +x "$FAKE_BIN/curl"

assert_pass() {
  local name="$1" log="$2"
  shift 2
  if "$@" >"$log" 2>&1; then
    echo "  ok   - $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL - $name"
    FAIL=$((FAIL + 1))
    sed 's/^/    /' "$log"
  fi
}

assert_fail() {
  local name="$1" log="$2"
  shift 2
  if "$@" >"$log" 2>&1; then
    echo "  FAIL - $name (expected non-zero exit)"
    FAIL=$((FAIL + 1))
  else
    echo "  ok   - $name"
    PASS=$((PASS + 1))
  fi
}

run_verifier() {
  local responses="$1" expected="$2" count_file="$3"
  PATH="$FAKE_BIN:$PATH" \
  FAKE_CURL_RESPONSES="$responses" \
  FAKE_CURL_COUNT="$count_file" \
  HEALTH_URL="https://example.test/healthz" \
  EXPECTED_GIT_COMMIT="$expected" \
  DEPLOY_SHA_ATTEMPTS=2 \
  DEPLOY_SHA_SLEEP=0 \
  bash "$SCRIPT"
}

echo "verify-deployed-sha.sh"

assert_pass "accepts the deployed short SHA as a prefix of the PR SHA" "$TMP/t1.log" \
  run_verifier '{"gitCommit":"abc1234"}' \
  "abc1234567890abcdef1234567890abcdef12345" "$TMP/t1.count"

assert_pass "retries a stale deployment and accepts the expected SHA" "$TMP/t2.log" \
  run_verifier \
  '{"gitCommit":"deadbee"}|{"gitCommit":"abc1234"}' \
  "abc1234567890abcdef1234567890abcdef12345" "$TMP/t2.count"

assert_fail "rejects a deployment that stays on another SHA" "$TMP/t3.log" \
  run_verifier '{"gitCommit":"deadbee"}' \
  "abc1234567890abcdef1234567890abcdef12345" "$TMP/t3.count"
if grep -q "did not reach expected commit" "$TMP/t3.log"; then
  echo "  ok   - stale deployment failure is diagnostic"
  PASS=$((PASS + 1))
else
  echo "  FAIL - stale deployment failure lacks a diagnostic"
  FAIL=$((FAIL + 1))
fi

assert_fail "rejects a malformed health response" "$TMP/t4.log" \
  run_verifier '{"ok":true}' \
  "abc1234567890abcdef1234567890abcdef12345" "$TMP/t4.count"

assert_fail "requires EXPECTED_GIT_COMMIT" "$TMP/t5.log" \
  env -u EXPECTED_GIT_COMMIT HEALTH_URL="https://example.test/healthz" \
  bash "$SCRIPT"

echo
echo "passed: $PASS  failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
