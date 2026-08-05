#!/usr/bin/env bash
# Behavioral tests for scripts/ci/ensure-dashboard-pages-project.sh.
#
# The fake Cloudflare API covers an existing project, first-time creation,
# concurrent creation by another workflow, and an authorization failure.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/ci/ensure-dashboard-pages-project.sh"
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
  local log="$3"

  "$PYTHON" - "$port" "$mode" "$log" >/dev/null 2>&1 <<'PY' &
import http.server
import json
import socketserver
import sys

port = int(sys.argv[1])
mode = sys.argv[2]
log_path = sys.argv[3]
created = mode in ("existing", "wrong-branch")
production_branch = "dev" if mode == "wrong-branch" else "main"

class Handler(http.server.BaseHTTPRequestHandler):
    def record(self):
        with open(log_path, "a", encoding="utf-8") as log:
            log.write(f"{self.command} {self.path}\n")

    def reply(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        global created, production_branch
        self.record()
        if mode == "unauthorized":
            self.reply(401, {"success": False})
        elif created:
            self.reply(200, {
                "success": True,
                "result": {
                    "name": "harpa-pro-dashboard",
                    "production_branch": production_branch,
                },
            })
        else:
            self.reply(404, {"success": False})

    def do_POST(self):
        global created, production_branch
        self.record()
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length))
        if payload != {"name": "harpa-pro-dashboard", "production_branch": "main"}:
            self.reply(400, {"success": False})
        elif mode == "race":
            created = True
            self.reply(409, {"success": False})
        else:
            created = True
            production_branch = "main"
            self.reply(200, {"success": True, "result": payload})

    def do_PATCH(self):
        global production_branch
        self.record()
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length))
        if payload != {"production_branch": "main"}:
            self.reply(400, {"success": False})
        else:
            production_branch = "main"
            self.reply(200, {
                "success": True,
                "result": {"production_branch": production_branch},
            })

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

run_script() {
  local port="$1"

  env \
    CLOUDFLARE_ACCOUNT_ID=test-account \
    CLOUDFLARE_API_TOKEN=test-token \
    CLOUDFLARE_API_BASE_URL="http://127.0.0.1:$port" \
    bash "$SCRIPT"
}

run_case() {
  local mode="$1"
  local name="$2"
  local request_log="$TMP/$mode.requests"
  local output_log="$TMP/$mode.log"
  local port
  local server_pid

  port="$(pick_port)"
  server_pid="$(start_server "$port" "$mode" "$request_log")"
  sleep 1
  assert_pass "$name" "$output_log" run_script "$port"
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}

echo "ensure-dashboard-pages-project.sh"

run_case existing "keeps an existing dashboard Pages project"
if [[ "$(grep -c '^POST ' "$TMP/existing.requests" || true)" -eq 0 ]]; then
  echo "  ok   - existing project is not recreated"
  PASS=$((PASS + 1))
else
  echo "  FAIL - existing project is not recreated"
  FAIL=$((FAIL + 1))
fi

run_case wrong-branch "repairs an existing project's production branch"
if [[ "$(grep -c '^PATCH ' "$TMP/wrong-branch.requests" || true)" -eq 1 ]]; then
  echo "  ok   - wrong production branch is updated exactly once"
  PASS=$((PASS + 1))
else
  echo "  FAIL - wrong production branch is updated exactly once"
  FAIL=$((FAIL + 1))
fi

run_case missing "creates the dashboard Pages project on first deploy"
if [[ "$(grep -c '^POST ' "$TMP/missing.requests" || true)" -eq 1 ]]; then
  echo "  ok   - missing project is created exactly once"
  PASS=$((PASS + 1))
else
  echo "  FAIL - missing project is created exactly once"
  FAIL=$((FAIL + 1))
fi

run_case race "accepts a project concurrently created by another workflow"
if [[ "$(grep -c '^GET ' "$TMP/race.requests" || true)" -eq 2 ]]; then
  echo "  ok   - create conflict is resolved with one verification read"
  PASS=$((PASS + 1))
else
  echo "  FAIL - create conflict is resolved with one verification read"
  FAIL=$((FAIL + 1))
fi

PORT="$(pick_port)"
SERVER_PID="$(start_server "$PORT" unauthorized "$TMP/unauthorized.requests")"
sleep 1
assert_fail \
  "fails closed when Cloudflare rejects the credentials" \
  "$TMP/unauthorized.log" \
  run_script "$PORT"
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true

assert_fail \
  "fails fast when the account id is missing" \
  "$TMP/unset.log" \
  env CLOUDFLARE_API_TOKEN=test-token bash "$SCRIPT"

echo
echo "passed: $PASS  failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
