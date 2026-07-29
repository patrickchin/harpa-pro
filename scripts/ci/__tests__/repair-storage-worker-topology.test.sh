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
      3)
        cat "${FLY_MACHINE_THIRD:-${FLY_MACHINE_SECOND:-$FLY_MACHINE_INITIAL}}"
        ;;
      4)
        cat "${FLY_MACHINE_FOURTH:-${FLY_MACHINE_THIRD:-${FLY_MACHINE_SECOND:-$FLY_MACHINE_INITIAL}}}"
        ;;
      *)
        cat "${FLY_MACHINE_FIFTH:-${FLY_MACHINE_FOURTH:-${FLY_MACHINE_THIRD:-${FLY_MACHINE_SECOND:-$FLY_MACHINE_INITIAL}}}}"
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
  "machine start")
    [[ "$*" == \
      "machine start worker-standby --app harpa-test" ]] || {
      echo "unexpected flyctl start arguments: $*" >&2
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
  local fourth="${4:-}"
  local fifth="${5:-}"

  FLYCTL_LOG="$TMP/flyctl.log" \
    FLYCTL_COUNT="$TMP/flyctl.count" \
    FLY_MACHINE_INITIAL="$FIXTURES/$initial" \
    FLY_MACHINE_SECOND="${second:+$FIXTURES/$second}" \
    FLY_MACHINE_THIRD="${third:+$FIXTURES/$third}" \
    FLY_MACHINE_FOURTH="${fourth:+$FIXTURES/$fourth}" \
    FLY_MACHINE_FIFTH="${fifth:+$FIXTURES/$fifth}" \
    STORAGE_WORKER_START_MAX_ATTEMPTS=2 \
    STORAGE_WORKER_START_POLL_SECONDS=0 \
    PATH="$TMP/bin:$PATH" \
    bash "$REPAIR_SCRIPT" harpa-test 2>&1
}

assert_no_mutation() {
  if grep -Eq '^machine\|(update|start|clone)\|' "$TMP/flyctl.log"; then
    echo "FAIL - fail-closed case mutated Fly Machines"
    cat "$TMP/flyctl.log"
    exit 1
  fi
}

assert_no_start_or_clone() {
  if grep -Eq '^machine\|(start|clone)\|' "$TMP/flyctl.log"; then
    echo "FAIL - unsafe transition started or cloned a Fly Machine"
    cat "$TMP/flyctl.log"
    exit 1
  fi
}

assert_no_clone() {
  if grep -q '^machine|clone|' "$TMP/flyctl.log"; then
    echo "FAIL - unsafe transition cloned a Fly Machine"
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

expect_failure_after_update_before_start() {
  local name="$1"
  local after_update="$2"
  local output
  local status

  reset_case
  set +e
  output=$(
    run_repair \
      "storage-workers-repairable.json" \
      "$after_update"
  )
  status=$?
  set -e

  [[ "$status" -ne 0 ]] || {
    echo "FAIL - $name unexpectedly passed"
    echo "$output"
    exit 1
  }
  grep -q '^machine|update|' "$TMP/flyctl.log" || {
    echo "FAIL - $name did not clear the exact standby first"
    cat "$TMP/flyctl.log"
    exit 1
  }
  assert_no_start_or_clone
  echo "  ok   - $name"
}

expect_failure_after_start_before_clone() {
  local name="$1"
  local after_start="$2"
  local output
  local status

  reset_case
  set +e
  output=$(
    run_repair \
      "storage-workers-repairable.json" \
      "storage-workers-stopped-no-standby.json" \
      "$after_start"
  )
  status=$?
  set -e

  [[ "$status" -ne 0 ]] || {
    echo "FAIL - $name unexpectedly passed"
    echo "$output"
    exit 1
  }
  [[ "$(grep -c '^machine|start|' "$TMP/flyctl.log")" -eq 1 ]] || {
    echo "FAIL - $name did not issue exactly one explicit start"
    cat "$TMP/flyctl.log"
    exit 1
  }
  assert_no_clone
  echo "  ok   - $name"
}

echo "storage-worker topology repair"

reset_case
healthy_output=$(run_repair "storage-workers-started.json")
[[ "$healthy_output" == *"storage-worker topology already healthy"* ]] || {
  echo "FAIL - healthy topology omitted no-op evidence"
  echo "$healthy_output"
  exit 1
}
assert_no_mutation
echo "  ok   - exact healthy pair is a no-op"

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
  "a stale stopped retry candidate fails closed" \
  "storage-workers-stopped-no-standby-stale.json" \
  "does not match the deployed app release"
expect_failure_without_mutation \
  "an incomplete stopped retry identity fails closed" \
  "storage-workers-stopped-no-standby-missing-identity.json" \
  "does not match the deployed app release"
expect_failure_without_mutation \
  "multiple stopped retry candidates are ambiguous" \
  "storage-workers-stopped-no-standby-ambiguous.json" \
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

expect_failure_after_update_before_start \
  "unchanged standby configuration blocks start" \
  "storage-workers-repairable.json"
expect_failure_after_update_before_start \
  "a replacement candidate after update blocks start" \
  "storage-workers-stopped-no-standby-replacement.json"
expect_failure_after_update_before_start \
  "another worker appearing after update blocks start" \
  "storage-workers-transition-extra-worker.json"
expect_failure_after_update_before_start \
  "release drift after update blocks start" \
  "storage-workers-stopped-no-standby-stale.json"

expect_failure_after_start_before_clone \
  "a start command that leaves the candidate stopped eventually fails" \
  "storage-workers-stopped-no-standby.json"
expect_failure_after_start_before_clone \
  "a replacement candidate after start blocks cloning" \
  "storage-workers-started-no-standby-replacement.json"
expect_failure_after_start_before_clone \
  "another worker appearing after start blocks cloning" \
  "storage-workers-started-extra-worker.json"
expect_failure_after_start_before_clone \
  "release drift after start blocks cloning" \
  "storage-workers-started-no-standby-stale-transition.json"

reset_case
stopped_retry_output=$(
  run_repair \
    "storage-workers-stopped-no-standby.json" \
    "storage-workers-starting-no-standby.json" \
    "storage-workers-repaired.json" \
    "storage-workers-repair-complete.json"
)
[[ "$stopped_retry_output" == *"storage-worker topology repaired"* ]] || {
  echo "FAIL - stopped/no-standby retry omitted completion evidence"
  echo "$stopped_retry_output"
  exit 1
}
mapfile -t STOPPED_RETRY_ACTIONS < "$TMP/flyctl.log"
[[ "${#STOPPED_RETRY_ACTIONS[@]}" -eq 6 ]] || {
  printf 'FAIL - expected 6 stopped retry actions, got %s\n' \
    "${#STOPPED_RETRY_ACTIONS[@]}"
  printf '  %s\n' "${STOPPED_RETRY_ACTIONS[@]}"
  exit 1
}
[[ "${STOPPED_RETRY_ACTIONS[0]}" == \
  "machines|list|--app|harpa-test|--json" ]]
[[ "${STOPPED_RETRY_ACTIONS[1]}" == \
  "machine|start|worker-standby|--app|harpa-test" ]]
[[ "${STOPPED_RETRY_ACTIONS[2]}" == \
  "machines|list|--app|harpa-test|--json" ]]
[[ "${STOPPED_RETRY_ACTIONS[3]}" == \
  "machines|list|--app|harpa-test|--json" ]]
[[ "${STOPPED_RETRY_ACTIONS[4]}" == \
  "machine|clone|worker-standby|--app|harpa-test|--standby-for=source" ]]
[[ "${STOPPED_RETRY_ACTIONS[5]}" == \
  "machines|list|--app|harpa-test|--json" ]]
echo "  ok   - stopped/no-standby retry starts, polls, then clones"

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
auto_started_repair_output=$(
  run_repair \
    "storage-workers-repairable.json" \
    "storage-workers-repaired.json" \
    "storage-workers-repair-complete.json"
)
[[ "$auto_started_repair_output" == *"storage-worker topology repaired"* ]] || {
  echo "FAIL - auto-started update repair omitted completion evidence"
  echo "$auto_started_repair_output"
  exit 1
}
mapfile -t AUTO_STARTED_REPAIR_ACTIONS < "$TMP/flyctl.log"
[[ "${#AUTO_STARTED_REPAIR_ACTIONS[@]}" -eq 5 ]] || {
  printf 'FAIL - expected 5 auto-started repair actions, got %s\n' \
    "${#AUTO_STARTED_REPAIR_ACTIONS[@]}"
  printf '  %s\n' "${AUTO_STARTED_REPAIR_ACTIONS[@]}"
  exit 1
}
[[ "${AUTO_STARTED_REPAIR_ACTIONS[0]}" == \
  "machines|list|--app|harpa-test|--json" ]]
[[ "${AUTO_STARTED_REPAIR_ACTIONS[1]}" == \
  "machine|update|worker-standby|--app|harpa-test|--standby-for||--yes" ]]
[[ "${AUTO_STARTED_REPAIR_ACTIONS[2]}" == \
  "machines|list|--app|harpa-test|--json" ]]
[[ "${AUTO_STARTED_REPAIR_ACTIONS[3]}" == \
  "machine|clone|worker-standby|--app|harpa-test|--standby-for=source" ]]
[[ "${AUTO_STARTED_REPAIR_ACTIONS[4]}" == \
  "machines|list|--app|harpa-test|--json" ]]
echo "  ok   - an update-started candidate is not started redundantly"

reset_case
repair_output=$(
  run_repair \
    "storage-workers-repairable.json" \
    "storage-workers-stopped-no-standby.json" \
    "storage-workers-starting-no-standby.json" \
    "storage-workers-repaired.json" \
    "storage-workers-repair-complete.json"
)
[[ "$repair_output" == *"storage-worker topology repaired"* ]] || {
  echo "FAIL - explicit-start repair omitted completion evidence"
  echo "$repair_output"
  exit 1
}
mapfile -t REPAIR_ACTIONS < "$TMP/flyctl.log"
[[ "${#REPAIR_ACTIONS[@]}" -eq 8 ]] || {
  printf 'FAIL - expected 8 explicit-start repair actions, got %s\n' \
    "${#REPAIR_ACTIONS[@]}"
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
  "machine|start|worker-standby|--app|harpa-test" ]]
[[ "${REPAIR_ACTIONS[4]}" == \
  "machines|list|--app|harpa-test|--json" ]]
[[ "${REPAIR_ACTIONS[5]}" == \
  "machines|list|--app|harpa-test|--json" ]]
[[ "${REPAIR_ACTIONS[6]}" == \
  "machine|clone|worker-standby|--app|harpa-test|--standby-for=source" ]]
[[ "${REPAIR_ACTIONS[7]}" == \
  "machines|list|--app|harpa-test|--json" ]]
echo "  ok   - exact standby is cleared, started, proved, then cloned"
