#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VERIFY_SCRIPT="$REPO_ROOT/scripts/ci/verify-storage-worker-started.sh"
FIXTURES="$REPO_ROOT/scripts/ci/__tests__/fixtures"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[[ -x "$VERIFY_SCRIPT" ]] || {
  echo "FAIL - missing executable worker-state verifier: $VERIFY_SCRIPT"
  exit 1
}

mkdir -p "$TMP/bin"
cat > "$TMP/bin/flyctl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

if [[ "$*" != "machines list --app harpa-test --json" ]]; then
  echo "unexpected flyctl arguments: $*" >&2
  exit 64
fi

cat "$FLY_MACHINE_FIXTURE"
SH
chmod +x "$TMP/bin/flyctl"

run_case() {
  local name="$1"
  local fixture="$2"
  local expected="$3"
  local output
  local status

  set +e
  output=$(
    FLY_MACHINE_FIXTURE="$FIXTURES/$fixture" \
      PATH="$TMP/bin:$PATH" \
      bash "$VERIFY_SCRIPT" harpa-test 2>&1
  )
  status=$?
  set -e

  if [[ "$expected" == "pass" ]]; then
    if [[ "$status" -ne 0 ]]; then
      echo "FAIL - $name unexpectedly failed"
      echo "$output"
      exit 1
    fi
    [[ "$output" == *"storage-worker ready: 1 started"* ]] || {
      echo "FAIL - $name omitted its success evidence"
      echo "$output"
      exit 1
    }
  else
    if [[ "$status" -eq 0 ]]; then
      echo "FAIL - $name unexpectedly passed"
      echo "$output"
      exit 1
    fi
    [[ "$output" == *"no started storage-worker Machine for harpa-test"* ]] || {
      echo "FAIL - $name omitted its fail-closed diagnostic"
      echo "$output"
      exit 1
    }
  fi

  echo "  ok   - $name"
}

echo "storage-worker started verifier"
run_case "zero workers fails" "storage-workers-zero.json" "fail"
run_case "only a stopped worker fails" "storage-workers-only-stopped.json" "fail"
run_case "a started worker passes" "storage-workers-started.json" "pass"
