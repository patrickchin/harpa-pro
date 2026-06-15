#!/usr/bin/env bash
# Tests for scripts/ci/verify-readyz.sh.
#
# Why this test exists: the production failure mode for /readyz verify
# is a cold-start machine that takes longer than the per-request curl
# timeout to wake up. We can't unit-test against real Fly, but we can
# fake an HTTP server that:
#   1. refuses connections for the first N seconds (machine suspended),
#   2. then returns 200 (machine ready).
# A correct verify loop must succeed against that timeline; the broken
# 5s-timeout-with-5s-retries loop will not.
#
# Run directly:
#   bash scripts/ci/__tests__/verify-readyz.test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/ci/verify-readyz.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; jobs -p | xargs -r kill 2>/dev/null || true' EXIT

PASS=0
FAIL=0

PYTHON="${PYTHON:-python3}"
if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "SKIP: python3 not available" >&2
  exit 0
fi

# Pick an unused TCP port. The chosen port is bound briefly by python
# then released; the test server then re-binds. Race window is small;
# if it bites in CI, swap to a fixed high port.
pick_port() {
  "$PYTHON" - <<'PY'
import socket
s = socket.socket(); s.bind(('127.0.0.1', 0))
print(s.getsockname()[1]); s.close()
PY
}

# Start a server that sleeps `boot_delay` seconds before listening,
# then serves 200 OK to any request. Mimics a Fly machine waking from
# `auto_stop_machines = suspend`.
start_delayed_server() {
  local port="$1" delay="$2"
  # Redirect stdout/stderr to /dev/null so $(start_delayed_server …)
  # doesn't block waiting for the backgrounded python's pipe to close.
  "$PYTHON" - "$port" "$delay" >/dev/null 2>&1 <<'PY' &
import sys, time, http.server, socketserver
port = int(sys.argv[1]); delay = float(sys.argv[2])
time.sleep(delay)
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.end_headers(); self.wfile.write(b'{"ok":true}')
    def log_message(self, *_): pass
with socketserver.TCPServer(("127.0.0.1", port), H) as httpd:
    httpd.serve_forever()
PY
  echo $!
}

assert_pass() {
  local name="$1" log="$2"; shift 2
  if "$@" >"$log" 2>&1; then
    echo "  ok   - $name"; PASS=$((PASS+1))
  else
    echo "  FAIL - $name"; FAIL=$((FAIL+1))
    echo "    --- log ---"; sed 's/^/    /' "$log"; echo "    -----------"
  fi
}

assert_fail() {
  local name="$1" log="$2"; shift 2
  if "$@" >"$log" 2>&1; then
    echo "  FAIL - $name (expected non-zero exit)"; FAIL=$((FAIL+1))
    echo "    --- log ---"; sed 's/^/    /' "$log"; echo "    -----------"
  else
    echo "  ok   - $name"; PASS=$((PASS+1))
  fi
}

echo "verify-readyz.sh"

# ---------------------------------------------------------------------------
# Test 1: Already-ready server → first attempt wins.
# ---------------------------------------------------------------------------
PORT="$(pick_port)"
SERVER_PID="$(start_delayed_server "$PORT" 0)"
sleep 1
assert_pass "succeeds when endpoint is already ready" "$TMP/t1.log" \
  env READYZ_URL="http://127.0.0.1:$PORT/readyz" \
      READYZ_ATTEMPTS=3 READYZ_TIMEOUT=5 READYZ_SLEEP=1 \
      bash "$SCRIPT"
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Test 2: Cold-start tolerated — server starts ~5s after deploy, well
# past the old 5s curl timeout. With the new defaults (timeout 30s,
# retries with sleep) the loop must succeed.
#
# Budget tuned for slow CI runners: connect-refused returns immediately,
# so the loop's tolerance comes from READYZ_SLEEP × (ATTEMPTS-1). With
# 8 attempts × 2s sleep we tolerate ~14s of cold-boot before failing,
# comfortably above the 5s server delay.
# ---------------------------------------------------------------------------
PORT="$(pick_port)"
SERVER_PID="$(start_delayed_server "$PORT" 5)"
assert_pass "succeeds against a 5-second cold-start (>5s curl)" "$TMP/t2.log" \
  env READYZ_URL="http://127.0.0.1:$PORT/readyz" \
      READYZ_ATTEMPTS=8 READYZ_TIMEOUT=10 READYZ_SLEEP=2 \
      bash "$SCRIPT"
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Test 3: Server never comes up → script fails with non-zero exit.
# ---------------------------------------------------------------------------
PORT="$(pick_port)"
assert_fail "fails when endpoint never responds" "$TMP/t3.log" \
  env READYZ_URL="http://127.0.0.1:$PORT/readyz" \
      READYZ_ATTEMPTS=2 READYZ_TIMEOUT=1 READYZ_SLEEP=1 \
      bash "$SCRIPT"
if grep -q "readyz never returned 2xx" "$TMP/t3.log"; then
  echo "  ok   - prints diagnostic on total failure"; PASS=$((PASS+1))
else
  echo "  FAIL - missing diagnostic in:"; cat "$TMP/t3.log"; FAIL=$((FAIL+1))
fi

# ---------------------------------------------------------------------------
# Test 4: Missing READYZ_URL → script refuses to run (set -u + :?).
# ---------------------------------------------------------------------------
assert_fail "fails fast when READYZ_URL is unset" "$TMP/t4.log" \
  env -u READYZ_URL bash "$SCRIPT"

echo
echo "passed: $PASS  failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
