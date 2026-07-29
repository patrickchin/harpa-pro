#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
REPAIR_SCRIPT="$REPO_ROOT/scripts/ci/repair-storage-worker-topology.sh"
FIXTURES="$REPO_ROOT/scripts/ci/__tests__/fixtures"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[[ -x "$REPAIR_SCRIPT" ]] || {
  echo "FAIL - missing executable worker-topology repair: $REPAIR_SCRIPT"
  exit 1
}

mkdir -p "$TMP/bin"
cat > "$TMP/bin/flyctl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

(
  IFS='|'
  printf '%s\n' "$*"
) >> "$FLYCTL_LOG"

case "${1:-} ${2:-}" in
  "machines list")
    if [[ "$*" != "machines list --app harpa-test --json" ]]; then
      echo "unexpected flyctl list arguments: $*" >&2
      exit 64
    fi
    call_count=0
    if [[ -f "$FLYCTL_COUNT" ]]; then
      call_count=$(<"$FLYCTL_COUNT")
    fi
    call_count=$((call_count + 1))
    printf '%s\n' "$call_count" > "$FLYCTL_COUNT"
    case "$call_count" in
      1)
        cat "$FLY_MACHINE_INITIAL"
        ;;
      2)
        cat "${FLY_MACHINE_SECOND:-$FLY_MACHINE_INITIAL}"
        ;;
      *)
        cat "${FLY_MACHINE_THIRD:-${FLY_MACHINE_SECOND:-$FLY_MACHINE_INITIAL}}"
        ;;
    esac
    ;;
  "machine update")
    [[ "$*" == \
      "machine update worker-standby --app harpa-test --standby-for  --yes" ]] || {
      echo "unexpected flyctl update arguments: $*" >&2
      exit 64
    }
    ;;
  "machine clone")
    [[ "$*" == \
      "machine clone worker-standby --app harpa-test --standby-for=source" || \
      "$*" == \
      "machine clone worker-started --app harpa-test --standby-for=source" ]] || {
      echo "unexpected flyctl clone arguments: $*" >&2
      exit 64
    }
    ;;
  *)
    echo "unexpected flyctl command: $*" >&2
    exit 64
    ;;
esac
SH
chmod +x "$TMP/bin/flyctl"

reset_case() {
  : > "$TMP/flyctl.log"
  rm -f "$TMP/flyctl.count"
}

run_repair() {
  local initial="$1"
  local second="${2:-}"
  local third="${3:-}"

  FLYCTL_LOG="$TMP/flyctl.log" \
    FLYCTL_COUNT="$TMP/flyctl.count" \
    FLY_MACHINE_INITIAL="$FIXTURES/$initial" \
    FLY_MACHINE_SECOND="${second:+$FIXTURES/$second}" \
    FLY_MACHINE_THIRD="${third:+$FIXTURES/$third}" \
    PATH="$TMP/bin:$PATH" \
    bash "$REPAIR_SCRIPT" harpa-test 2>&1
}

assert_no_mutation() {
  if grep -Eq '^machine\|(update|clone)\|' "$TMP/flyctl.log"; then
    echo "FAIL - fail-closed case mutated Fly Machines"
    cat "$TMP/flyctl.log"
    exit 1
  fi
}

expect_failure_without_mutation() {
  local name="$1"
  local fixture="$2"
  local diagnostic="$3"
  local output
  local status

  reset_case
  set +e
  output=$(run_repair "$fixture")
  status=$?
  set -e

  [[ "$status" -ne 0 ]] || {
    echo "FAIL - $name unexpectedly passed"
    echo "$output"
    exit 1
  }
  [[ "$output" == *"$diagnostic"* ]] || {
    echo "FAIL - $name omitted its diagnostic"
    echo "$output"
    exit 1
  }
  assert_no_mutation
  echo "  ok   - $name"
}

echo "storage-worker topology repair"

reset_case
healthy_output=$(run_repair "storage-workers-started.json")
[[ "$healthy_output" == *"storage-worker topology already has a started worker"* ]] || {
  echo "FAIL - healthy topology omitted no-op evidence"
  echo "$healthy_output"
  exit 1
}
assert_no_mutation
echo "  ok   - started worker is a no-op"

expect_failure_without_mutation \
  "a stale started worker fails closed" \
  "storage-workers-started-stale.json" \
  "does not match the deployed app release"
expect_failure_without_mutation \
  "an incomplete started-worker identity is not trusted" \
  "storage-workers-started-missing-identity.json" \
  "does not match the deployed app release"
expect_failure_without_mutation \
  "multiple started workers without a standby are ambiguous" \
  "storage-workers-started-multiple.json" \
  "cannot safely repair storage-worker topology"
expect_failure_without_mutation \
  "a stale standby makes a started topology unsafe" \
  "storage-workers-started-stale-standby.json" \
  "does not match the deployed app release"

expect_failure_without_mutation \
  "zero workers fail closed" \
  "storage-workers-zero.json" \
  "cannot safely repair storage-worker topology"
expect_failure_without_mutation \
  "a stopped non-standby fails closed" \
  "storage-workers-only-stopped.json" \
  "cannot safely repair storage-worker topology"
expect_failure_without_mutation \
  "multiple stopped standbys are ambiguous" \
  "storage-workers-ambiguous.json" \
  "cannot safely repair storage-worker topology"
expect_failure_without_mutation \
  "a suspended standby is not mutated" \
  "storage-workers-suspended.json" \
  "cannot safely repair storage-worker topology"
expect_failure_without_mutation \
  "a stale standby is not started" \
  "storage-workers-stale.json" \
  "does not match the deployed app release"
expect_failure_without_mutation \
  "an incomplete standby identity is not trusted" \
  "storage-workers-missing-identity.json" \
  "does not match the deployed app release"

reset_case
set +e
failed_verify_output=$(
  run_repair \
    "storage-workers-repairable.json" \
    "storage-workers-only-stopped.json"
)
failed_verify_status=$?
set -e
[[ "$failed_verify_status" -ne 0 ]] || {
  echo "FAIL - repair continued after started-worker verification failed"
  echo "$failed_verify_output"
  exit 1
}
grep -q '^machine|update|' "$TMP/flyctl.log" || {
  echo "FAIL - repair did not clear the exact standby"
  cat "$TMP/flyctl.log"
  exit 1
}
if grep -q '^machine|clone|' "$TMP/flyctl.log"; then
  echo "FAIL - repair cloned before started-worker verification passed"
  cat "$TMP/flyctl.log"
  exit 1
fi
echo "  ok   - failed started-worker verification blocks cloning"

reset_case
started_recovery_output=$(
  run_repair \
    "storage-workers-started-no-standby.json" \
    "storage-workers-started.json"
)
[[ "$started_recovery_output" == *"storage-worker topology repaired"* ]] || {
  echo "FAIL - missing-standby recovery omitted completion evidence"
  echo "$started_recovery_output"
  exit 1
}
mapfile -t STARTED_RECOVERY_ACTIONS < "$TMP/flyctl.log"
[[ "${#STARTED_RECOVERY_ACTIONS[@]}" -eq 3 ]] || {
  printf 'FAIL - expected 3 missing-standby recovery actions, got %s\n' \
    "${#STARTED_RECOVERY_ACTIONS[@]}"
  printf '  %s\n' "${STARTED_RECOVERY_ACTIONS[@]}"
  exit 1
}
[[ "${STARTED_RECOVERY_ACTIONS[0]}" == \
  "machines|list|--app|harpa-test|--json" ]]
[[ "${STARTED_RECOVERY_ACTIONS[1]}" == \
  "machine|clone|worker-started|--app|harpa-test|--standby-for=source" ]]
[[ "${STARTED_RECOVERY_ACTIONS[2]}" == \
  "machines|list|--app|harpa-test|--json" ]]
echo "  ok   - current singleton worker gets one verified standby clone"

reset_case
set +e
failed_clone_verify_output=$(
  run_repair \
    "storage-workers-started-no-standby.json" \
    "storage-workers-started-no-standby.json"
)
failed_clone_verify_status=$?
set -e
[[ "$failed_clone_verify_status" -ne 0 ]] || {
  echo "FAIL - recovery passed without observing the cloned standby"
  echo "$failed_clone_verify_output"
  exit 1
}
[[ "$(grep -c '^machine|clone|' "$TMP/flyctl.log")" -eq 1 ]] || {
  echo "FAIL - recovery did not clone exactly once"
  cat "$TMP/flyctl.log"
  exit 1
}
echo "  ok   - clone result must contain a healthy standby"

reset_case
repair_output=$(
  run_repair \
    "storage-workers-repairable.json" \
    "storage-workers-repaired.json" \
    "storage-workers-repair-complete.json"
)
[[ "$repair_output" == *"storage-worker topology repaired"* ]] || {
  echo "FAIL - successful repair omitted completion evidence"
  echo "$repair_output"
  exit 1
}
mapfile -t REPAIR_ACTIONS < "$TMP/flyctl.log"
[[ "${#REPAIR_ACTIONS[@]}" -eq 5 ]] || {
  printf 'FAIL - expected 5 repair actions, got %s\n' "${#REPAIR_ACTIONS[@]}"
  printf '  %s\n' "${REPAIR_ACTIONS[@]}"
  exit 1
}
[[ "${REPAIR_ACTIONS[0]}" == \
  "machines|list|--app|harpa-test|--json" ]]
[[ "${REPAIR_ACTIONS[1]}" == \
  "machine|update|worker-standby|--app|harpa-test|--standby-for||--yes" ]]
[[ "${REPAIR_ACTIONS[2]}" == \
  "machines|list|--app|harpa-test|--json" ]]
[[ "${REPAIR_ACTIONS[3]}" == \
  "machine|clone|worker-standby|--app|harpa-test|--standby-for=source" ]]
[[ "${REPAIR_ACTIONS[4]}" == \
  "machines|list|--app|harpa-test|--json" ]]
echo "  ok   - exact standby is promoted, verified, then cloned"
