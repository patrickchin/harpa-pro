#!/usr/bin/env bash
# Tests for scripts/check-no-maestro-point-taps.sh.
#
# Run directly:
#   bash scripts/ci/__tests__/check-no-maestro-point-taps.test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/check-no-maestro-point-taps.sh"
BASH_BIN="${BASH:-bash}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0

write_flow() {
  local dir="$1" body="$2"
  mkdir -p "$dir"
  printf '%s\n' "$body" >"$dir/flow.yaml"
}

assert_pass() {
  local name="$1" log="$2"
  shift 2
  if "$@" >"$log" 2>&1; then
    echo "  ok   - $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL - $name"
    FAIL=$((FAIL + 1))
    echo "    --- log ---"
    sed 's/^/    /' "$log"
    echo "    -----------"
  fi
}

assert_fail() {
  local name="$1" log="$2"
  shift 2
  if "$@" >"$log" 2>&1; then
    echo "  FAIL - $name (expected non-zero exit)"
    FAIL=$((FAIL + 1))
    echo "    --- log ---"
    sed 's/^/    /' "$log"
    echo "    -----------"
  else
    echo "  ok   - $name"
    PASS=$((PASS + 1))
  fi
}

run_guard() {
  local maestro_dir="$1"
  MAESTRO_DIR="$maestro_dir" "$BASH_BIN" "$SCRIPT"
}

echo "check-no-maestro-point-taps.sh"

BAD_DIR="$TMP/bad/.maestro"
write_flow "$BAD_DIR" "appId: \${MAESTRO_APP_ID}
---
- tapOn:
    point: \"90%,71%\""
assert_fail "rejects coordinate point taps" "$TMP/bad.log" \
  run_guard "$BAD_DIR"
if grep -q "point:" "$TMP/bad.log"; then
  echo "  ok   - prints matching point tap"
  PASS=$((PASS + 1))
else
  echo "  FAIL - missing matching point tap in diagnostic"
  FAIL=$((FAIL + 1))
fi

GOOD_DIR="$TMP/good/.maestro"
write_flow "$GOOD_DIR" "appId: \${MAESTRO_APP_ID}
---
- tapOn:
    id: btn-add-attachments
- tapOn:
    text: Add attachments"
assert_pass "allows semantic taps" "$TMP/good.log" \
  run_guard "$GOOD_DIR"

echo
echo "passed: $PASS  failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
