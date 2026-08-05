#!/usr/bin/env bash
# Idempotently ensure the dedicated dashboard Cloudflare Pages project exists.
# This keeps the first PR preview deployable without an out-of-band project
# creation step. A second concurrent workflow may win the create race; in that
# case a final GET confirms the desired end state.
set -euo pipefail

ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID required}"
API_TOKEN="${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN required}"
API_BASE="${CLOUDFLARE_API_BASE_URL:-https://api.cloudflare.com/client/v4}"
PROJECT_NAME="${DASHBOARD_PAGES_PROJECT:-harpa-pro-dashboard}"
PRODUCTION_BRANCH="${DASHBOARD_PAGES_PRODUCTION_BRANCH:-main}"
TIMEOUT="${CLOUDFLARE_API_TIMEOUT:-30}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

API_BASE="${API_BASE%/}"
PROJECTS_URL="$API_BASE/accounts/$ACCOUNT_ID/pages/projects"
PROJECT_URL="$PROJECTS_URL/$PROJECT_NAME"

if [[ ! "$PROJECT_NAME" =~ ^[a-z0-9-]+$ ]]; then
  echo "DASHBOARD_PAGES_PROJECT must contain only lowercase letters, digits, and hyphens" >&2
  exit 1
fi

if [[ ! "$PRODUCTION_BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]]; then
  echo "DASHBOARD_PAGES_PRODUCTION_BRANCH contains unsupported characters" >&2
  exit 1
fi

if [[ ! "$TIMEOUT" =~ ^[1-9][0-9]*$ ]]; then
  echo "CLOUDFLARE_API_TIMEOUT must be a positive integer" >&2
  exit 1
fi

request() {
  local method="$1"
  local url="$2"
  local output="$3"
  local payload="${4:-}"
  local args=(
    --silent
    --show-error
    --max-time "$TIMEOUT"
    --request "$method"
    --header "Authorization: Bearer $API_TOKEN"
    --header "Content-Type: application/json"
    --output "$output"
    --write-out "%{http_code}"
  )

  if [[ -n "$payload" ]]; then
    args+=(--data "$payload")
  fi

  curl "${args[@]}" "$url"
}

read_production_branch() {
  local response_file="$1"

  node -e "
    const fs = require('node:fs');
    const response = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    if (typeof response?.result?.production_branch !== 'string') {
      process.exit(1);
    }
    process.stdout.write(response.result.production_branch);
  " "$response_file"
}

ensure_production_branch() {
  local response_file="$1"
  local current_branch
  local payload
  local update_status

  if ! current_branch="$(read_production_branch "$response_file")"; then
    echo "Cloudflare Pages project response omitted production_branch" >&2
    return 1
  fi

  if [[ "$current_branch" == "$PRODUCTION_BRANCH" ]]; then
    echo "Cloudflare Pages project $PROJECT_NAME already exists"
    return 0
  fi

  payload="$(
    printf \
      '{"production_branch":"%s"}' \
      "$PRODUCTION_BRANCH"
  )"
  update_status=""
  if update_status="$(request PATCH "$PROJECT_URL" "$TMP/update.json" "$payload")" &&
    [[ "$update_status" == "200" ]]; then
    echo "Updated Cloudflare Pages project $PROJECT_NAME production branch to $PRODUCTION_BRANCH"
    return 0
  fi

  echo "Cloudflare Pages production branch update failed with HTTP ${update_status:-request-failed}" >&2
  return 1
}

status=""
if ! status="$(request GET "$PROJECT_URL" "$TMP/get.json")"; then
  echo "Could not read Cloudflare Pages project $PROJECT_NAME" >&2
  exit 1
fi

if [[ "$status" == "200" ]]; then
  ensure_production_branch "$TMP/get.json"
  exit
fi

if [[ "$status" != "404" ]]; then
  echo "Cloudflare Pages project lookup failed with HTTP $status" >&2
  exit 1
fi

payload="$(
  printf \
    '{"name":"%s","production_branch":"%s"}' \
    "$PROJECT_NAME" \
    "$PRODUCTION_BRANCH"
)"
create_status=""
if create_status="$(request POST "$PROJECTS_URL" "$TMP/create.json" "$payload")" &&
  [[ "$create_status" == "200" || "$create_status" == "201" ]]; then
  echo "Created Cloudflare Pages project $PROJECT_NAME (production branch $PRODUCTION_BRANCH)"
  exit 0
fi

# Another first deployment may have created the project between our GET and
# POST. Confirm that end state before treating the create response as fatal.
verify_status=""
if verify_status="$(request GET "$PROJECT_URL" "$TMP/verify.json")" &&
  [[ "$verify_status" == "200" ]]; then
  echo "Cloudflare Pages project $PROJECT_NAME was created concurrently"
  ensure_production_branch "$TMP/verify.json"
  exit
fi

echo "Cloudflare Pages project create failed with HTTP ${create_status:-request-failed}" >&2
exit 1
