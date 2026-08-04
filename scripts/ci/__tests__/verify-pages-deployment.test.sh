#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
test_dir=$(mktemp -d)
port_file="$test_dir/port"
server_pid=""

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf -- "$test_dir"
}
trap cleanup EXIT

sha=0123456789abcdef0123456789abcdef01234567
TEST_PAGES_COMMIT="$sha" TEST_PAGES_BRANCH=pr-42 \
  python3 "$repo_root/scripts/ci/__tests__/pages-verify-server.py" \
  "$port_file" &
server_pid=$!

for _ in {1..50}; do
  [[ -s "$port_file" ]] && break
  sleep 0.1
done
[[ -s "$port_file" ]]
port=$(<"$port_file")

PAGES_VERIFY_TIMEOUT_SEC=5 \
  bash "$repo_root/scripts/ci/verify-pages-deployment.sh" \
  --origin "http://127.0.0.1:$port" \
  --commit "$sha" \
  --branch pr-42 \
  --title 'Business activity — Harpa Pro Admin' \
  --missing-route /__missing_admin_route__ \
  --redirect-path /guides/getting-started \
  --redirect-suffix /docs/guides/getting-started

if PAGES_VERIFY_TIMEOUT_SEC=1 \
  bash "$repo_root/scripts/ci/verify-pages-deployment.sh" \
  --origin "http://127.0.0.1:$port" \
  --commit ffffffffffffffffffffffffffffffffffffffff \
  --branch pr-42 >/dev/null 2>&1; then
  echo 'mismatched deployment marker unexpectedly passed' >&2
  exit 1
fi

echo 'verify-pages-deployment: ok'
