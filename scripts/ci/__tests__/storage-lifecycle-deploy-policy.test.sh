#!/usr/bin/env bash
# Executable policy guard for the storage-lifecycle production rollout.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DEPLOY_SCRIPT="$REPO_ROOT/infra/fly/deploy.sh"
DEV_WORKFLOW="$REPO_ROOT/.github/workflows/api-dev.yml"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin"

cat > "$TMP/bin/flyctl" <<'SH'
#!/usr/bin/env bash
printf 'flyctl %s\n' "$*" >> "$POLICY_LOG"
if [[ "$*" == "machines list --app harpa-pro-api --json" ]]; then
  printf '%s\n' \
    '[{"state":"started","config":{"metadata":{"fly_process_group":"storage-worker"}}}]'
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
if [[ -z "$DEV_DEPLOY_LINE" || -z "$DEV_VERIFY_LINE" || -z "$DEV_ARM_LINE" ||
      "$DEV_DEPLOY_LINE" -ge "$DEV_VERIFY_LINE" ||
      "$DEV_VERIFY_LINE" -ge "$DEV_ARM_LINE" ]]; then
  echo "  FAIL - dev must deploy, verify a started worker, then arm"
  exit 1
fi
echo "  ok   - dev deploy verifies a started worker before arming"

POLICY_LOG="$TMP/actions.log" \
PATH="$TMP/bin:$PATH" \
  env -u DATABASE_URL bash "$DEPLOY_SCRIPT" --remote-only >/dev/null

mapfile -t ACTIONS < "$TMP/actions.log"
if [[ "${#ACTIONS[@]}" -ne 3 ]]; then
  printf '  FAIL - expected 3 deploy actions, got %s\n' "${#ACTIONS[@]}"
  printf '    %s\n' "${ACTIONS[@]}"
  exit 1
fi

[[ "${ACTIONS[0]}" == "flyctl deploy "* ]] || {
  echo "  FAIL - first action is not flyctl deploy"
  exit 1
}
[[ "${ACTIONS[1]}" == \
  "flyctl machines list --app harpa-pro-api --json" ]] || {
  echo "  FAIL - started-worker verification does not follow deploy"
  exit 1
}
[[ "${ACTIONS[2]}" == \
  "flyctl ssh console --app harpa-pro-api --process-group storage-worker --pty=false --command STORAGE_LEASE_ROLLOUT_GRACE_SEC=330 STORAGE_ACCOUNT_DELETE_ENABLED=true pnpm --filter @harpa/api storage:arm-leases" ]] || {
  echo "  FAIL - remote lifecycle arming does not follow worker verification"
  exit 1
}

echo "  ok   - deploy, started-worker verification, and arming run in order"
echo "  ok   - production DATABASE_URL stays inside Fly"

grep -q 'STORAGE_ACCOUNT_DELETE_ENABLED=false' \
  "$REPO_ROOT/.github/workflows/pr-preview.yml"
if grep -q 'storage-worker = ' "$REPO_ROOT/infra/fly/fly.preview.toml"; then
  echo "  FAIL - preview config provisions a storage worker"
  exit 1
fi
echo "  ok   - previews keep deletion disabled without a worker"
