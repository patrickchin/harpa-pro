#!/usr/bin/env bash
# Poll an HTTP endpoint until it returns 2xx or the retry budget is
# exhausted. Tolerates Fly machine cold-start: dev (and PR previews)
# run with `auto_stop_machines = "suspend"` + `min_machines_running = 0`
# (see infra/fly/fly.dev.toml), so the first request after a deploy
# has to wake a suspended/stopped machine before /readyz can answer.
# A 5s curl timeout is not enough for Linux + Node + DB pool init +
# the schema-head check inside /readyz — see the recurring bug entry
# in docs/bugs/README.md ("api-dev /readyz verify cold-start").
#
# Used by both .github/workflows/api-dev.yml and api-prod.yml after
# `flyctl deploy` so the workflow goes red iff the new container is
# not actually serving /readyz.
#
# Configuration via env (all optional except READYZ_URL):
#   READYZ_URL       — endpoint to probe (required)
#   READYZ_ATTEMPTS  — total curl attempts (default: 6)
#   READYZ_TIMEOUT   — per-attempt --max-time, seconds (default: 30)
#   READYZ_SLEEP     — sleep between attempts, seconds (default: 10)
#
# Exits 0 on the first 2xx response, 1 if all attempts fail.
set -euo pipefail

URL="${READYZ_URL:?READYZ_URL required}"
ATTEMPTS="${READYZ_ATTEMPTS:-6}"
TIMEOUT="${READYZ_TIMEOUT:-30}"
SLEEP_SECS="${READYZ_SLEEP:-10}"

for i in $(seq 1 "$ATTEMPTS"); do
  if curl --fail --silent --show-error --max-time "$TIMEOUT" "$URL"; then
    echo
    echo "readyz ok on attempt $i"
    exit 0
  fi
  if [[ "$i" -lt "$ATTEMPTS" ]]; then
    echo "readyz attempt $i failed, retrying in ${SLEEP_SECS}s..."
    sleep "$SLEEP_SECS"
  fi
done

echo "readyz never returned 2xx after ${ATTEMPTS} attempts (timeout=${TIMEOUT}s each) — investigate Fly logs" >&2
exit 1
