#!/usr/bin/env bash
# Behaviour tests for scripts/ci/wait-for-pr-preview.sh.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/ci/wait-for-pr-preview.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [[ ! -f "$SCRIPT" ]]; then
  echo "FAIL: missing scripts/ci/wait-for-pr-preview.sh" >&2
  exit 1
fi

FAKE_BIN="$TMP/bin"
mkdir -p "$FAKE_BIN"
# The fake gh script returns a sequence for workflow-run lookups and another
# for job lookups. Responses use \t escapes and | separators.
# shellcheck disable=SC2016
printf '%s\n' '#!/usr/bin/env bash
set -euo pipefail
printf "%s\n" "$*" >> "$FAKE_GH_ARGS_LOG"
if [[ " $* " == *"/actions/workflows/"*"/runs"* ]]; then
  responses="$FAKE_GH_RUN_RESPONSES"
  count_file="$FAKE_GH_RUN_COUNT"
elif [[ " $* " == *"/actions/runs/"*"/jobs"* ]]; then
  responses="$FAKE_GH_JOB_RESPONSES"
  count_file="$FAKE_GH_JOB_COUNT"
else
  echo "unexpected gh call: $*" >&2
  exit 1
fi
count=0
if [[ -f "$count_file" ]]; then
  count="$(<"$count_file")"
fi
count=$((count + 1))
printf "%s" "$count" > "$count_file"
IFS="|" read -r -a items <<< "$responses"
index=$((count - 1))
if [[ "$index" -ge "${#items[@]}" ]]; then
  index=$((${#items[@]} - 1))
fi
if [[ "$index" -ge 0 ]]; then
  printf "%b" "${items[$index]}"
fi' > "$FAKE_BIN/gh"
chmod +x "$FAKE_BIN/gh"

PASS=0
FAIL=0
FULL_SHA="abc1234567890abcdef1234567890abcdef12345"

assert_pass() {
  local name="$1" log="$2"
  shift 2
  if "$@" > "$log" 2>&1; then
    echo "  ok   - $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL - $name"
    FAIL=$((FAIL + 1))
    sed 's/^/    /' "$log"
  fi
}

assert_fail() {
  local name="$1" log="$2"
  shift 2
  if "$@" > "$log" 2>&1; then
    echo "  FAIL - $name (expected non-zero exit)"
    FAIL=$((FAIL + 1))
  else
    echo "  ok   - $name"
    PASS=$((PASS + 1))
  fi
}

run_waiter() {
  local run_responses="$1" job_responses="$2" prefix="$3"
  : > "$TMP/$prefix-run-count"
  : > "$TMP/$prefix-job-count"
  : > "$TMP/$prefix-args"
  PATH="$FAKE_BIN:$PATH" \
    GH_TOKEN="test-token" \
    GITHUB_REPOSITORY="patrickchin/harpa-pro" \
    PR_HEAD_SHA="$FULL_SHA" \
    PREVIEW_RUN_ATTEMPTS=2 \
    PREVIEW_RUN_SLEEP=0 \
    FAKE_GH_RUN_RESPONSES="$run_responses" \
    FAKE_GH_JOB_RESPONSES="$job_responses" \
    FAKE_GH_RUN_COUNT="$TMP/$prefix-run-count" \
    FAKE_GH_JOB_COUNT="$TMP/$prefix-job-count" \
    FAKE_GH_ARGS_LOG="$TMP/$prefix-args" \
    bash "$SCRIPT"
}

echo "wait-for-pr-preview.sh"

assert_pass "accepts a successful exact-head fly-preview job" "$TMP/t1.log" \
  run_waiter '101\tcompleted\tsuccess' 'completed\tsuccess' t1

assert_pass "waits for the preview job to finish" "$TMP/t2.log" \
  run_waiter \
    '101\tin_progress\t|101\tcompleted\tsuccess' \
    'in_progress\t|completed\tsuccess' t2

assert_fail "rejects a skipped fly-preview job" "$TMP/t3.log" \
  run_waiter '101\tcompleted\tsuccess' 'completed\tskipped' t3
if grep -q "fly-preview concluded skipped" "$TMP/t3.log"; then
  echo "  ok   - skipped preview failure is diagnostic"
  PASS=$((PASS + 1))
else
  echo "  FAIL - skipped preview failure lacks a diagnostic"
  FAIL=$((FAIL + 1))
fi

assert_fail "rejects a failed preview workflow" "$TMP/t4.log" \
  run_waiter '101\tcompleted\tfailure' '' t4

assert_fail "fails when no matching preview run appears" "$TMP/t5.log" \
  run_waiter '' '' t5

assert_fail "rejects an abbreviated PR head SHA" "$TMP/t6.log" \
  env \
    GH_TOKEN="test-token" \
    GITHUB_REPOSITORY="patrickchin/harpa-pro" \
    PR_HEAD_SHA="${FULL_SHA:0:12}" \
    bash "$SCRIPT"

if grep -q "head_sha=$FULL_SHA" "$TMP/t1-args" && \
  grep -q "/actions/runs/101/jobs" "$TMP/t1-args"; then
  echo "  ok   - API lookups bind the head SHA and selected run"
  PASS=$((PASS + 1))
else
  echo "  FAIL - API lookups are not bound to the head SHA and selected run"
  FAIL=$((FAIL + 1))
fi

echo
echo "failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
