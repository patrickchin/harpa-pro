#!/usr/bin/env bash
# Tests for scripts/check-native-input-smoke.sh.
#
# Run directly:
#   bash scripts/ci/__tests__/check-native-input-smoke.test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/check-native-input-smoke.sh"
BASH_BIN="${BASH:-bash}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0

write_case() {
  local root="$1" flow="$2" readme="$3"
  mkdir -p "$root/.maestro"
  printf '%s\n' "$flow" >"$root/.maestro/native-input-smoke.yaml"
  printf '%s\n' "$readme" >"$root/.maestro/README.md"
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
  local root="$1"
  MAESTRO_DIR="$root/.maestro" "$BASH_BIN" "$SCRIPT"
}

echo "check-native-input-smoke.sh"

MISSING="$TMP/missing"
mkdir -p "$MISSING/.maestro"
assert_fail "requires the native input smoke flow" "$TMP/missing.log" \
  run_guard "$MISSING"

GOOD="$TMP/good"
write_case "$GOOD" "appId: \${MAESTRO_APP_ID}
name: Native input smoke
---
# Pre-condition: EXPO_PUBLIC_USE_FIXTURES=false.
- runFlow: modules/01-auth.yaml
- runFlow: modules/02-projects-crud.yaml
- tapOn:
    id: btn-record-start
- extendedWaitUntil:
    visible:
      id: voice-record-strip
    timeout: 8000
- extendedWaitUntil:
    visible:
      id: voice-record-duration
    timeout: 5000
- tapOn:
    id: btn-record-cancel
- tapOn:
    id: btn-attachment
- extendedWaitUntil:
    visible:
      id: btn-attachment-camera
    timeout: 8000
- tapOn:
    id: btn-attachment-camera
- extendedWaitUntil:
    visible:
      id: camera-capture-root
    timeout: 15000
- extendedWaitUntil:
    visible:
      id: btn-camera-shutter
    timeout: 8000
- tapOn:
    id: btn-camera-shutter
- extendedWaitUntil:
    visible:
      id: btn-camera-thumb-0
    timeout: 15000
- tapOn:
    id: btn-camera-cancel
- extendedWaitUntil:
    visible:
      id: btn-camera-confirm-discard
    timeout: 8000" "## Native input smoke

Run with EXPO_PUBLIC_USE_FIXTURES=false.

maestro test .maestro/native-input-smoke.yaml"
assert_pass "accepts native recorder and camera smoke" "$TMP/good.log" \
  run_guard "$GOOD"

VOICE_ONLY="$TMP/voice-only"
write_case "$VOICE_ONLY" "appId: \${MAESTRO_APP_ID}
---
# Pre-condition: EXPO_PUBLIC_USE_FIXTURES=false.
- runFlow: modules/01-auth.yaml
- runFlow: modules/02-projects-crud.yaml
- tapOn:
    id: btn-record-start
- extendedWaitUntil:
    visible:
      id: voice-record-strip
    timeout: 8000
- extendedWaitUntil:
    visible:
      id: voice-record-duration
    timeout: 5000
- tapOn:
    id: btn-record-cancel" "Run with EXPO_PUBLIC_USE_FIXTURES=false.

maestro test .maestro/native-input-smoke.yaml"
assert_fail "rejects voice-only native smoke" "$TMP/voice-only.log" \
  run_guard "$VOICE_ONLY"

FIXTURE="$TMP/fixture"
write_case "$FIXTURE" "appId: \${MAESTRO_APP_ID}
---
# Pre-condition: EXPO_PUBLIC_USE_FIXTURES=true.
- tapOn:
    id: btn-record-start
- extendedWaitUntil:
    visible:
      id: voice-record-strip
    timeout: 8000
- tapOn:
    id: btn-record-cancel" "Run with EXPO_PUBLIC_USE_FIXTURES=true."
assert_fail "rejects fixture-mode smoke docs" "$TMP/fixture.log" \
  run_guard "$FIXTURE"

PIPELINE="$TMP/pipeline"
write_case "$PIPELINE" "appId: \${MAESTRO_APP_ID}
---
# Pre-condition: EXPO_PUBLIC_USE_FIXTURES=false.
- tapOn:
    id: btn-record-start
- extendedWaitUntil:
    visible:
      id: voice-record-strip
    timeout: 8000
- tapOn:
    id: btn-record-send
- extendedWaitUntil:
    visible:
      id: voice-title-.*" "Run with EXPO_PUBLIC_USE_FIXTURES=false."
assert_fail "rejects upload/transcription pipeline assertions" "$TMP/pipeline.log" \
  run_guard "$PIPELINE"

echo
echo "passed: $PASS  failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
