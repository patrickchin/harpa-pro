#!/usr/bin/env bash
# Verify that a Cloudflare Pages deployment serves the dashboard's SPA entry
# document for both `/` and a directly loaded client-side route.
#
# Cloudflare Pages enables its implicit SPA fallback only when the deployment
# has no top-level 404.html. Comparing both response bodies proves the fallback
# itself, rather than accepting an unrelated 200 page.
#
# Configuration via env (all optional except DASHBOARD_URL):
#   DASHBOARD_URL       — deployed Pages/custom-domain URL (required)
#   DASHBOARD_DEEP_PATH — client route to load directly
#   DASHBOARD_ATTEMPTS  — total attempts while the deployment propagates
#   DASHBOARD_TIMEOUT   — per-request curl timeout in seconds
#   DASHBOARD_SLEEP     — seconds between attempts
set -euo pipefail

BASE_URL="${DASHBOARD_URL:?DASHBOARD_URL required}"
DEEP_PATH="${DASHBOARD_DEEP_PATH:-/projects/spa-routing-smoke}"
ATTEMPTS="${DASHBOARD_ATTEMPTS:-18}"
TIMEOUT="${DASHBOARD_TIMEOUT:-20}"
SLEEP_SECS="${DASHBOARD_SLEEP:-5}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

BASE_URL="${BASE_URL%/}"

if [[ "$DEEP_PATH" != /* ]]; then
  echo "DASHBOARD_DEEP_PATH must begin with /" >&2
  exit 1
fi

for value in "$ATTEMPTS" "$TIMEOUT" "$SLEEP_SECS"; do
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    echo "Dashboard Pages retry settings must be non-negative integers" >&2
    exit 1
  fi
done

if [[ "$ATTEMPTS" -eq 0 || "$TIMEOUT" -eq 0 ]]; then
  echo "DASHBOARD_ATTEMPTS and DASHBOARD_TIMEOUT must be greater than zero" >&2
  exit 1
fi

fetch_page() {
  local url="$1"
  local output="$2"

  curl \
    --silent \
    --show-error \
    --max-time "$TIMEOUT" \
    --header "Accept: text/html" \
    --output "$output" \
    --write-out "%{http_code}" \
    "$url"
}

for attempt in $(seq 1 "$ATTEMPTS"); do
  root_status=""
  deep_status=""

  if ! root_status="$(fetch_page "$BASE_URL/" "$TMP/root.html")"; then
    root_status="request-failed"
  fi
  if ! deep_status="$(fetch_page "$BASE_URL$DEEP_PATH" "$TMP/deep.html")"; then
    deep_status="request-failed"
  fi

  if [[ "$root_status" == "200" && "$deep_status" == "200" ]] &&
    cmp --silent "$TMP/root.html" "$TMP/deep.html"; then
    echo "dashboard Pages SPA ok on attempt $attempt: $BASE_URL$DEEP_PATH"
    exit 0
  fi

  echo "dashboard Pages attempt $attempt failed: root=$root_status deep=$deep_status" >&2
  if [[ "$attempt" -lt "$ATTEMPTS" ]]; then
    sleep "$SLEEP_SECS"
  fi
done

echo "dashboard Pages never served the SPA entry document at $DEEP_PATH after $ATTEMPTS attempts" >&2
exit 1
