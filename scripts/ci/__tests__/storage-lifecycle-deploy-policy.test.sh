#!/usr/bin/env bash
# Executable policy guard for the storage-lifecycle production rollout.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DEPLOY_SCRIPT="$REPO_ROOT/infra/fly/deploy.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin"

cat > "$TMP/bin/flyctl" <<'SH'
#!/usr/bin/env bash
printf 'flyctl %s\n' "$*" >> "$POLICY_LOG"
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
if [[ "${#WORKER_SCALE_COMMANDS[@]}" -eq 0 ]]; then
  echo "  FAIL - no storage-worker scale commands found"
  exit 1
fi
for command in "${WORKER_SCALE_COMMANDS[@]}"; do
  if [[ "$command" != *" --yes"* ]]; then
    echo "  FAIL - storage-worker scale can prompt in CI: $command"
    exit 1
  fi
done
echo "  ok   - storage-worker scale commands confirm noninteractively"

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
  "flyctl scale count storage-worker=1 --app harpa-pro-api --yes" ]] || {
  echo "  FAIL - worker scaling does not follow deploy"
  exit 1
}
[[ "${ACTIONS[2]}" == \
  "flyctl ssh console --app harpa-pro-api --process-group storage-worker --pty=false --command STORAGE_LEASE_ROLLOUT_GRACE_SEC=330 STORAGE_ACCOUNT_DELETE_ENABLED=true pnpm --filter @harpa/api storage:arm-leases" ]] || {
  echo "  FAIL - remote lifecycle arming does not follow worker scaling"
  exit 1
}

echo "  ok   - deploy, worker scale, and remote monotonic arming run in order"
echo "  ok   - production DATABASE_URL stays inside Fly"

grep -q 'STORAGE_ACCOUNT_DELETE_ENABLED=false' \
  "$REPO_ROOT/.github/workflows/pr-preview.yml"
if grep -q 'storage-worker = ' "$REPO_ROOT/infra/fly/fly.preview.toml"; then
  echo "  FAIL - preview config provisions a storage worker"
  exit 1
fi
echo "  ok   - previews keep deletion disabled without a worker"
