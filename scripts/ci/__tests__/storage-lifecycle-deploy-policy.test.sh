#!/usr/bin/env bash
# Executable policy guard for the storage-lifecycle production rollout.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DEPLOY_SCRIPT="$REPO_ROOT/infra/fly/deploy.sh"
ARM_SCRIPT="$REPO_ROOT/scripts/ci/arm-storage-lifecycle-rollout.sh"
DEV_WORKFLOW="$REPO_ROOT/.github/workflows/api-dev.yml"
PROD_WORKFLOW="$REPO_ROOT/.github/workflows/api-prod.yml"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin"

cat > "$TMP/bin/flyctl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

printf 'flyctl %s\n' "$*" >> "$POLICY_LOG"
if [[ "$*" == "machines list --app harpa-pro-api --json" ]]; then
  printf '%s\n' \
    '[{"id":"app-current","state":"started","config":{"image":"registry.fly.io/harpa-pro-api:current","metadata":{"fly_process_group":"app","fly_release_id":"rel-current","fly_release_version":"42"}}},{"id":"worker-started","state":"started","config":{"image":"registry.fly.io/harpa-pro-api:current","metadata":{"fly_process_group":"storage-worker","fly_release_id":"rel-current","fly_release_version":"42"},"services":[],"standbys":[]}},{"id":"worker-standby","state":"stopped","config":{"image":"registry.fly.io/harpa-pro-api:current","metadata":{"fly_process_group":"storage-worker","fly_release_id":"rel-current","fly_release_version":"42"},"services":[],"standbys":["worker-started"]}}]'
fi

if [[ "${1:-} ${2:-}" == "machine exec" ]]; then
  exec_count=0
  if [[ -f "$POLICY_EXEC_COUNTER" ]]; then
    exec_count=$(<"$POLICY_EXEC_COUNTER")
  fi
  exec_count=$((exec_count + 1))
  printf '%s\n' "$exec_count" > "$POLICY_EXEC_COUNTER"
  if [[ "$exec_count" -le "${POLICY_EXEC_FAILURES:-0}" ]]; then
    echo "simulated Machine exec transport failure" >&2
    exit 1
  fi
  if [[ "${POLICY_EXEC_OMIT_MARKER:-0}" == "1" ]]; then
    echo "remote command finished without application evidence"
  else
    echo "[storage-lifecycle] lease enforcement armed for 2026-08-04T00:00:00.000Z"
  fi
fi
SH

chmod +x "$TMP/bin/flyctl"

echo "storage-lifecycle deploy policy"

mapfile -t WORKER_SCALE_COMMANDS < <(
  grep -RFnH \
    --include='*.sh' \
    --include='*.yml' \
    --include='*.yaml' \
    'flyctl scale count storage-worker=' \
    "$REPO_ROOT/infra/fly" \
    "$REPO_ROOT/.github/workflows"
)
if [[ "${#WORKER_SCALE_COMMANDS[@]}" -ne 0 ]]; then
  echo "  FAIL - explicit storage-worker scaling can destroy either Fly Machine"
  printf '    %s\n' "${WORKER_SCALE_COMMANDS[@]}"
  exit 1
fi
echo "  ok   - Fly owns the service-less worker's active/standby pair"

DEV_DEPLOY_LINE=$(
  grep -n -m1 -E '^[[:space:]]+flyctl deploy \\$' "$DEV_WORKFLOW" \
    | cut -d: -f1 \
    || true
)
DEV_REPAIR_LINE=$(
  grep -n -m1 -F \
    'bash scripts/ci/repair-storage-worker-topology.sh harpa-pro-api-dev' \
    "$DEV_WORKFLOW" \
    | cut -d: -f1 \
    || true
)
DEV_VERIFY_LINE=$(
  grep -n -m1 -F \
    'bash scripts/ci/verify-storage-worker-started.sh harpa-pro-api-dev' \
    "$DEV_WORKFLOW" \
    | cut -d: -f1 \
    || true
)
DEV_ARM_LINE=$(
  grep -n -m1 -F \
    'pnpm --filter @harpa/api storage:arm-leases' \
    "$DEV_WORKFLOW" \
    | cut -d: -f1 \
    || true
)
if [[ -z "$DEV_DEPLOY_LINE" || -z "$DEV_REPAIR_LINE" ||
      -z "$DEV_VERIFY_LINE" || -z "$DEV_ARM_LINE" ||
      "$DEV_DEPLOY_LINE" -ge "$DEV_REPAIR_LINE" ||
      "$DEV_REPAIR_LINE" -ge "$DEV_VERIFY_LINE" ||
      "$DEV_VERIFY_LINE" -ge "$DEV_ARM_LINE" ]]; then
  echo "  FAIL - dev must deploy, narrowly repair, verify, then arm"
  exit 1
fi
echo "  ok   - dev deploy repairs narrowly and verifies before arming"

POLICY_LOG="$TMP/actions.log" \
POLICY_EXEC_COUNTER="$TMP/exec-count" \
PATH="$TMP/bin:$PATH" \
  env -u DATABASE_URL bash "$DEPLOY_SCRIPT" --remote-only >/dev/null

mapfile -t ACTIONS < "$TMP/actions.log"
if [[ "${#ACTIONS[@]}" -ne 5 ]]; then
  printf '  FAIL - expected 5 deploy actions, got %s\n' "${#ACTIONS[@]}"
  printf '    %s\n' "${ACTIONS[@]}"
  exit 1
fi

[[ "${ACTIONS[0]}" == "flyctl deploy "* ]] || {
  echo "  FAIL - first action is not flyctl deploy"
  exit 1
}
[[ "${ACTIONS[1]}" == \
  "flyctl machines list --app harpa-pro-api --json" ]] || {
  echo "  FAIL - narrow worker repair does not follow deploy"
  exit 1
}
[[ "${ACTIONS[2]}" == \
  "flyctl machines list --app harpa-pro-api --json" ]] || {
  echo "  FAIL - started-worker verification does not follow repair"
  exit 1
}
[[ "${ACTIONS[3]}" == \
  "flyctl machines list --app harpa-pro-api --json" ]] || {
  echo "  FAIL - arming does not select a fresh exact worker target"
  exit 1
}
[[ "${ACTIONS[4]}" == \
  "flyctl machine exec worker-started env STORAGE_LEASE_ROLLOUT_GRACE_SEC=330 STORAGE_ACCOUNT_DELETE_ENABLED=true pnpm --filter @harpa/api storage:arm-leases --app harpa-pro-api --timeout 120" ]] || {
  echo "  FAIL - remote lifecycle arming does not follow worker verification"
  exit 1
}

echo "  ok   - deploy, narrow repair, verification, and arming run in order"
echo "  ok   - arming targets the exact worker through bounded Machine exec"
echo "  ok   - production DATABASE_URL stays inside Fly"

PROD_DEPLOY_STEP=$(
  sed -n \
    '/^[[:space:]]*- name: Deploy to Fly.io$/,/^[[:space:]]*- name: Verify \/readyz$/p' \
    "$PROD_WORKFLOW"
)
if [[ "$PROD_DEPLOY_STEP" != *"timeout-minutes: 30"* ]]; then
  echo "  FAIL - production Fly deploy is missing its outer timeout"
  exit 1
fi
echo "  ok   - production deploy has a 30-minute outer deadline"

set +e
retry_output=$(
  POLICY_LOG="$TMP/retry-actions.log" \
  POLICY_EXEC_COUNTER="$TMP/retry-count" \
  POLICY_EXEC_FAILURES=1 \
  STORAGE_LIFECYCLE_ARM_RETRY_DELAY_SECONDS=0 \
  PATH="$TMP/bin:$PATH" \
    bash "$ARM_SCRIPT" harpa-pro-api 2>&1
)
retry_status=$?
set -e
if [[ "$retry_status" -ne 0 ]]; then
  echo "  FAIL - a retryable Machine exec failure did not recover"
  echo "$retry_output"
  exit 1
fi
mapfile -t RETRY_ACTIONS < "$TMP/retry-actions.log"
if [[ "${#RETRY_ACTIONS[@]}" -ne 4 ||
      "${RETRY_ACTIONS[1]}" != "${RETRY_ACTIONS[3]}" ]]; then
  echo "  FAIL - retry did not re-prove and reuse the exact worker target"
  printf '    %s\n' "${RETRY_ACTIONS[@]}"
  exit 1
fi
echo "  ok   - transient exec failure re-proves and retries the same worker"

set +e
bounded_output=$(
  POLICY_LOG="$TMP/bounded-actions.log" \
  POLICY_EXEC_COUNTER="$TMP/bounded-count" \
  POLICY_EXEC_FAILURES=99 \
  STORAGE_LIFECYCLE_ARM_ATTEMPTS=2 \
  STORAGE_LIFECYCLE_ARM_RETRY_DELAY_SECONDS=0 \
  PATH="$TMP/bin:$PATH" \
    bash "$ARM_SCRIPT" harpa-pro-api 2>&1
)
bounded_status=$?
set -e
if [[ "$bounded_status" -eq 0 ||
      "$(<"$TMP/bounded-count")" -ne 2 ||
      "$bounded_output" != *"failed after 2 attempts"* ]]; then
  echo "  FAIL - arming did not stop at its configured retry budget"
  echo "$bounded_output"
  exit 1
fi
echo "  ok   - repeated exec failure stops at the bounded retry budget"

set +e
marker_output=$(
  POLICY_LOG="$TMP/marker-actions.log" \
  POLICY_EXEC_COUNTER="$TMP/marker-count" \
  POLICY_EXEC_OMIT_MARKER=1 \
  STORAGE_LIFECYCLE_ARM_ATTEMPTS=1 \
  PATH="$TMP/bin:$PATH" \
    bash "$ARM_SCRIPT" harpa-pro-api 2>&1
)
marker_status=$?
set -e
if [[ "$marker_status" -eq 0 ||
      "$marker_output" != *"without the rollout confirmation marker"* ]]; then
  echo "  FAIL - a zero provider exit without database evidence passed arming"
  echo "$marker_output"
  exit 1
fi
echo "  ok   - provider success without the database marker fails closed"

grep -q 'STORAGE_ACCOUNT_DELETE_ENABLED=false' \
  "$REPO_ROOT/.github/workflows/pr-preview.yml"
if grep -q 'storage-worker = ' "$REPO_ROOT/infra/fly/fly.preview.toml"; then
  echo "  FAIL - preview config provisions a storage worker"
  exit 1
fi
echo "  ok   - previews keep deletion disabled without a worker"
