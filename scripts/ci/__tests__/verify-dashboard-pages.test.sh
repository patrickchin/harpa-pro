#!/usr/bin/env bash
# Behavioral tests for scripts/ci/verify-dashboard-pages.sh.
#
# The fake server distinguishes Cloudflare's required SPA behavior from two
# deceptively green deploys: a deep-link 404 and a deep link that returns a
# different HTML document.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/ci/verify-dashboard-pages.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; jobs -p | xargs -r kill 2>/dev/null || true' EXIT

PASS=0
FAIL=0
PYTHON="${PYTHON:-python3}"

if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "SKIP: python3 not available" >&2
  exit 0
fi

pick_port() {
  "$PYTHON" - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
}

start_server() {
  local port="$1"
  local mode="$2"

  "$PYTHON" - "$port" "$mode" >/dev/null 2>&1 <<'PY' &
import http.server
import socketserver
import sys

port = int(sys.argv[1])
mode = sys.argv[2]
root = b"<!doctype html><html><body><div id='root'></div></body></html>"

class Handler(http.server.BaseHTTPRequestHandler):
    requests = 0

    def do_GET(self):
        Handler.requests += 1

        if mode == "warming" and Handler.requests <= 12:
            status, body = 522, b"deployment is still propagating"
        elif self.path == "/":
            status, body = 200, root
        elif mode == "spa":
            status, body = 200, root
        elif mode == "warming":
            status, body = 200, root
        elif mode == "missing":
            status, body = 404, b"not found"
        else:
            status, body = 200, b"<html><body>wrong document</body></html>"

        self.send_response(status)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass

with socketserver.TCPServer(("127.0.0.1", port), Handler) as server:
    server.serve_forever()
PY
  echo "$!"
}

assert_pass() {
  local name="$1"
  local log="$2"
  shift 2

  if "$@" >"$log" 2>&1; then
    echo "  ok   - $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL - $name"
    sed 's/^/         /' "$log"
    FAIL=$((FAIL + 1))
  fi
}

assert_fail() {
  local name="$1"
  local log="$2"
  shift 2

  if "$@" >"$log" 2>&1; then
    echo "  FAIL - $name (expected non-zero exit)"
    FAIL=$((FAIL + 1))
  else
    echo "  ok   - $name"
    PASS=$((PASS + 1))
  fi
}

run_verifier() {
  local url="$1"

  env \
    DASHBOARD_URL="$url" \
    DASHBOARD_ATTEMPTS=1 \
    DASHBOARD_TIMEOUT=2 \
    DASHBOARD_SLEEP=0 \
    bash "$SCRIPT"
}

run_verifier_with_default_attempts() {
  local url="$1"

  env \
    DASHBOARD_URL="$url" \
    DASHBOARD_TIMEOUT=2 \
    DASHBOARD_SLEEP=0 \
    bash "$SCRIPT"
}

echo "verify-dashboard-pages.sh"

PORT="$(pick_port)"
SERVER_PID="$(start_server "$PORT" spa)"
sleep 1
assert_pass \
  "accepts a deep route served by the SPA entry document" \
  "$TMP/spa.log" \
  run_verifier "http://127.0.0.1:$PORT/"
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true

PORT="$(pick_port)"
SERVER_PID="$(start_server "$PORT" warming)"
sleep 1
assert_pass \
  "allows the Pages deployment propagation window to settle" \
  "$TMP/warming.log" \
  run_verifier_with_default_attempts "http://127.0.0.1:$PORT/"
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true

PORT="$(pick_port)"
SERVER_PID="$(start_server "$PORT" missing)"
sleep 1
assert_fail \
  "rejects a deployed deep-link 404" \
  "$TMP/missing.log" \
  run_verifier "http://127.0.0.1:$PORT"
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true

PORT="$(pick_port)"
SERVER_PID="$(start_server "$PORT" wrong)"
sleep 1
assert_fail \
  "rejects a deep route that is not the SPA entry document" \
  "$TMP/wrong.log" \
  run_verifier "http://127.0.0.1:$PORT"
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true

assert_fail \
  "fails fast when DASHBOARD_URL is unset" \
  "$TMP/unset.log" \
  env -u DASHBOARD_URL bash "$SCRIPT"

echo
echo "passed: $PASS  failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
