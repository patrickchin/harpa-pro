#!/usr/bin/env bash
set -euo pipefail

: "${RUNNER_TEMP:?RUNNER_TEMP must be set}"

readonly METRO_LOG="$RUNNER_TEMP/metro.log"
readonly MAESTRO_DEBUG_DIR="$RUNNER_TEMP/maestro-debug"
metro_pid=""

mkdir -p "$MAESTRO_DEBUG_DIR"
: > "$METRO_LOG"

cleanup() {
  local status="$1"
  trap - EXIT

  if [[ -n "$metro_pid" ]]; then
    kill "$metro_pid" 2>/dev/null || true
    wait "$metro_pid" 2>/dev/null || true
  fi

  if ((status != 0)); then
    printf 'exit_status=%s\n' "$status" > "$MAESTRO_DEBUG_DIR/exit-status.txt"
    adb devices -l > "$MAESTRO_DEBUG_DIR/adb-devices.txt" 2>&1 || true
    adb logcat -d -t 500 > "$MAESTRO_DEBUG_DIR/adb-logcat.txt" 2>&1 || true
  fi

  exit "$status"
}
trap 'cleanup "$?"' EXIT

bash scripts/maestro/prepare-android-emulator.sh

adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8081 tcp:8081

pnpm --filter @harpa/mobile exec expo start \
  --dev-client --port 8081 > "$METRO_LOG" 2>&1 &
metro_pid=$!

metro_ready=0
for _ in $(seq 1 90); do
  if curl --fail --silent http://127.0.0.1:8081/status \
    | grep -q "packager-status:running"; then
    metro_ready=1
    break
  fi
  sleep 1
done
if ((metro_ready != 1)); then
  tail -80 "$METRO_LOG" >&2
  exit 1
fi

timeout 600s "$HOME/.maestro/bin/maestro" test \
  --env MAESTRO_APP_ID=com.harpa.pro.dev \
  --debug-output "$MAESTRO_DEBUG_DIR" \
  .maestro/ci-launch-smoke.yaml
