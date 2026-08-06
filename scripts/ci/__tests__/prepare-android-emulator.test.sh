#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/maestro/prepare-android-emulator.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FAKE_ADB="$TMP/adb"
ADB_LOG="$TMP/adb.log"

cat >"$FAKE_ADB" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_ADB_LOG"
case "$*" in
  "get-state")
    printf 'device\n'
    ;;
  "shell getprop ro.kernel.qemu")
    printf '%s\r\n' "${FAKE_QEMU:-1}"
    ;;
  "shell settings put global hide_error_dialogs 1")
    if [[ "${FAKE_PUT_FAIL:-0}" == "1" ]]; then
      printf 'settings service unavailable\n' >&2
      exit 65
    fi
    ;;
  "shell settings get global hide_error_dialogs")
    printf '%s\r\n' "${FAKE_HIDE_ERROR_DIALOGS:-1}"
    ;;
  *)
    printf 'unexpected adb arguments: %s\n' "$*" >&2
    exit 64
    ;;
esac
FAKE
chmod +x "$FAKE_ADB"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

export FAKE_ADB_LOG="$ADB_LOG"

: >"$ADB_LOG"
ADB="$FAKE_ADB" bash "$SCRIPT" >"$TMP/success.out" 2>"$TMP/success.err"
grep -Fq 'shell settings put global hide_error_dialogs 1' "$ADB_LOG" ||
  fail 'success path did not set hide_error_dialogs'
grep -Fq 'shell settings get global hide_error_dialogs' "$ADB_LOG" ||
  fail 'success path did not verify hide_error_dialogs'

: >"$ADB_LOG"
if FAKE_QEMU=0 ADB="$FAKE_ADB" bash "$SCRIPT" >"$TMP/device.out" 2>"$TMP/device.err"; then
  fail 'non-emulator path unexpectedly succeeded'
fi
grep -Fq 'refusing to change a non-emulator device' "$TMP/device.err" ||
  fail 'non-emulator refusal was not explained'
if grep -Fq 'settings put' "$ADB_LOG"; then
  fail 'non-emulator path changed a global setting'
fi

: >"$ADB_LOG"
if FAKE_PUT_FAIL=1 ADB="$FAKE_ADB" bash "$SCRIPT" >"$TMP/put.out" 2>"$TMP/put.err"; then
  fail 'settings write failure unexpectedly succeeded'
fi
grep -Fq 'settings service unavailable' "$TMP/put.err" ||
  fail 'settings write failure was not propagated'
if grep -Fq 'settings get global hide_error_dialogs' "$ADB_LOG"; then
  fail 'read-back ran after the settings write failed'
fi

: >"$ADB_LOG"
if FAKE_HIDE_ERROR_DIALOGS=0 ADB="$FAKE_ADB" bash "$SCRIPT" >"$TMP/mismatch.out" 2>"$TMP/mismatch.err"; then
  fail 'read-back mismatch unexpectedly succeeded'
fi
grep -Fq 'expected hide_error_dialogs=1, got 0' "$TMP/mismatch.err" ||
  fail 'read-back mismatch was not explained'

printf 'prepare-android-emulator tests passed\n'
