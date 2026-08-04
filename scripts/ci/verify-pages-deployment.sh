#!/usr/bin/env bash
# Wait for a stable Pages origin to serve the exact expected Git deployment.

set -euo pipefail

origin=""
expected_commit=""
expected_branch=""
expected_title=""
missing_route=""
redirect_path=""
redirect_suffix=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --origin) origin="$2"; shift 2 ;;
    --commit) expected_commit="$2"; shift 2 ;;
    --branch) expected_branch="$2"; shift 2 ;;
    --title) expected_title="$2"; shift 2 ;;
    --missing-route) missing_route="$2"; shift 2 ;;
    --redirect-path) redirect_path="$2"; shift 2 ;;
    --redirect-suffix) redirect_suffix="$2"; shift 2 ;;
    *) echo "ERROR: unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$origin" || ! "$expected_commit" =~ ^[0-9a-f]{40}$ || \
      ! "$expected_branch" =~ ^(main|dev|pr-[0-9]+)$ ]]; then
  echo "ERROR: --origin, full --commit, and valid --branch are required" >&2
  exit 2
fi
if [[ -n "$redirect_path" && -z "$redirect_suffix" ]] || \
   [[ -z "$redirect_path" && -n "$redirect_suffix" ]]; then
  echo "ERROR: --redirect-path and --redirect-suffix must be paired" >&2
  exit 2
fi

origin="${origin%/}"
timeout_seconds="${PAGES_VERIFY_TIMEOUT_SEC:-900}"
deadline=$((SECONDS + timeout_seconds))
response_file="$(mktemp)"
trap 'rm -f -- "$response_file"' EXIT

marker_matches() {
  curl --fail --silent --show-error \
    --connect-timeout 10 --max-time 30 \
    --output "$response_file" \
    "$origin/_cf-pages-deployment.json" \
    && grep -Fq -- "\"commit\":\"$expected_commit\"" "$response_file" \
    && grep -Fq -- "\"branch\":\"$expected_branch\"" "$response_file"
}

until marker_matches; do
  if (( SECONDS >= deadline )); then
    echo "ERROR: $origin did not serve commit $expected_commit from $expected_branch" >&2
    exit 1
  fi
  sleep 5
done

if [[ -n "$expected_title" ]]; then
  curl --fail --silent --show-error \
    --connect-timeout 10 --max-time 30 \
    --output "$response_file" "$origin/"
  grep -Fq -- "<title>$expected_title</title>" "$response_file"
fi

if [[ -n "$missing_route" ]]; then
  status="$(curl --silent --show-error \
    --connect-timeout 10 --max-time 30 \
    --output /dev/null --write-out '%{http_code}' \
    "$origin$missing_route")"
  [[ "$status" == 404 ]] || {
    echo "ERROR: $origin$missing_route returned $status, expected 404" >&2
    exit 1
  }
fi

if [[ -n "$redirect_path" ]]; then
  expected_redirect="$origin$redirect_suffix"
  read -r status location < <(
    curl --silent --show-error --output /dev/null \
      --connect-timeout 10 --max-time 30 --max-redirs 0 \
      --write-out '%{http_code} %{redirect_url}\n' \
      "$origin$redirect_path"
  )
  [[ "$status" == 301 && "$location" == "$expected_redirect" ]] || {
    echo "ERROR: unexpected redirect: status=$status location=$location expected=$expected_redirect" >&2
    exit 1
  }
fi

echo "Pages verified: origin=$origin branch=$expected_branch commit=$expected_commit"
