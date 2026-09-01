#!/usr/bin/env bash
# Prepare a disposable Android emulator for local Maestro runs.
set -euo pipefail

adb_bin="${ADB:-adb}"

"$adb_bin" get-state >/dev/null

is_emulator="$("$adb_bin" shell getprop ro.kernel.qemu | tr -d '\r')"
if [[ "$is_emulator" != "1" ]]; then
  printf 'refusing to change a non-emulator device (ro.kernel.qemu=%s)\n' \
    "$is_emulator" >&2
  exit 1
fi

"$adb_bin" shell settings put global hide_error_dialogs 1
hide_error_dialogs="$(
  "$adb_bin" shell settings get global hide_error_dialogs | tr -d '\r'
)"
if [[ "$hide_error_dialogs" != "1" ]]; then
  printf 'expected hide_error_dialogs=1, got %s\n' \
    "$hide_error_dialogs" >&2
  exit 1
fi

printf 'Android emulator prepared: hide_error_dialogs=1\n'
