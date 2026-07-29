#!/usr/bin/env bash
# Repair only two exact Fly storage-worker failure modes: a current-release
# standby survived without its active source, or one active survived without
# its standby.
set -euo pipefail

if [[ "$#" -ne 1 || -z "$1" ]]; then
  echo "usage: $0 <fly-app-name>" >&2
  exit 64
fi

APP_NAME="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

load_inventory() {
  local machines_json

  machines_json=$(flyctl machines list --app "$APP_NAME" --json)
  if ! INVENTORY_JSON=$(
    jq -ce '
      if type == "array" then
        .
      else
        error("expected a Machine array")
      end
    ' <<< "$machines_json"
  ); then
    echo "::error::invalid Fly Machine inventory for $APP_NAME" >&2
    return 1
  fi
}

resolve_deployed_identity() {
  if ! DEPLOYED_IDENTITY=$(
    jq -ce '
      def identity:
        {
          release_id: .config.metadata.fly_release_id,
          release_version: .config.metadata.fly_release_version,
          image: .config.image
        };
      [
        .[]
        | select(.config.metadata.fly_process_group == "app")
        | identity
      ] as $identities
      | if
          ($identities | length) == 0
          or any(
            $identities[];
            (.release_id | type) != "string"
            or (.release_id | length) == 0
            or (.release_version | type) != "string"
            or (.release_version | length) == 0
            or (.image | type) != "string"
            or (.image | length) == 0
          )
          or ($identities | unique | length) != 1
        then
          error("missing or ambiguous app release identity")
        else
          $identities[0]
        end
    ' <<< "$INVENTORY_JSON"
  ); then
    echo "::error::cannot determine one complete deployed app release for $APP_NAME" >&2
    return 1
  fi
}

validate_deployed_identity() {
  local inventory_json="$1"
  local worker_identity_summary

  if jq -e --argjson deployed "$DEPLOYED_IDENTITY" '
    def identity:
      {
        release_id: .config.metadata.fly_release_id,
        release_version: .config.metadata.fly_release_version,
        image: .config.image
      };
    [
      .[]
      | select(.config.metadata.fly_process_group == "app")
    ] as $apps
    | [
        .[]
        | select(.config.metadata.fly_process_group == "storage-worker")
      ] as $workers
    | ($apps | length) > 0
      and all($apps[]; identity == $deployed)
      and all($workers[]; identity == $deployed)
  ' <<< "$inventory_json" >/dev/null; then
    return 0
  fi

  worker_identity_summary=$(
    jq -c '
      [
        .[]
        | select(.config.metadata.fly_process_group == "storage-worker")
        | {
            id,
            release_id: .config.metadata.fly_release_id,
            release_version: .config.metadata.fly_release_version,
            image: .config.image
          }
      ]
    ' <<< "$inventory_json"
  )
  echo "::error::one or more storage-workers does not match the deployed app release for $APP_NAME; app=$DEPLOYED_IDENTITY workers=$worker_identity_summary" >&2
  return 1
}

load_topology() {
  local inventory_json="$1"

  WORKER_COUNT=$(
    jq -r '
      [
        .[]
        | select(.config.metadata.fly_process_group == "storage-worker")
      ]
      | length
    ' <<< "$inventory_json"
  )
  STARTED_WORKERS_JSON=$(
    jq -c '
      [
        .[]
        | select(.config.metadata.fly_process_group == "storage-worker")
        | select(.state == "started")
        | select(
            ((.config.services // []) | type) == "array"
            and ((.config.services // []) | length) == 0
            and ((.config.standbys // []) | type) == "array"
            and ((.config.standbys // []) | length) == 0
            and ((.id // "") | type) == "string"
            and ((.id // "") | length) > 0
        )
      ]
    ' <<< "$inventory_json"
  )
  STANDBY_WORKERS_JSON=$(
    jq -c '
      [
        .[]
        | select(.config.metadata.fly_process_group == "storage-worker")
        | select(.state == "stopped")
        | select(
            ((.config.services // []) | type) == "array"
            and ((.config.services // []) | length) == 0
            and ((.config.standbys // []) | type) == "array"
            and ((.config.standbys // []) | length) == 1
            and ((.id // "") | type) == "string"
            and ((.id // "") | length) > 0
        )
      ]
    ' <<< "$inventory_json"
  )
  STARTED_COUNT=$(jq -r 'length' <<< "$STARTED_WORKERS_JSON")
  STANDBY_COUNT=$(jq -r 'length' <<< "$STANDBY_WORKERS_JSON")
}

topology_is_healthy() {
  local active_id

  [[ "$WORKER_COUNT" -eq 2 &&
    "$STARTED_COUNT" -eq 1 &&
    "$STANDBY_COUNT" -eq 1 ]] || return 1

  active_id=$(jq -er '.[0].id' <<< "$STARTED_WORKERS_JSON")
  jq -e --arg active_id "$active_id" '
    .[0].config.standbys == [$active_id]
  ' <<< "$STANDBY_WORKERS_JSON" >/dev/null
}

topology_summary() {
  jq -c '
    [
      .[]
      | select(.config.metadata.fly_process_group == "storage-worker")
      | {
          id,
          state,
          services: (.config.services // []),
          standbys: (.config.standbys // [])
        }
    ]
  ' <<< "$INVENTORY_JSON"
}

verify_healthy_inventory() {
  load_inventory
  validate_deployed_identity "$INVENTORY_JSON"
  load_topology "$INVENTORY_JSON"
  if ! topology_is_healthy; then
    echo "::error::storage-worker repair did not produce exactly one current-release active worker and one stopped standby watching it for $APP_NAME; observed=$(topology_summary)" >&2
    return 1
  fi
}

load_inventory
resolve_deployed_identity
validate_deployed_identity "$INVENTORY_JSON"
load_topology "$INVENTORY_JSON"

if topology_is_healthy; then
  echo "storage-worker topology already healthy: one active worker and one standby ($APP_NAME)"
  exit 0
fi

if [[ "$WORKER_COUNT" -eq 1 &&
  "$STARTED_COUNT" -eq 1 &&
  "$STANDBY_COUNT" -eq 0 ]]; then
  SOURCE_ID=$(jq -er '.[0].id' <<< "$STARTED_WORKERS_JSON")
  echo "restoring standby for current-release storage-worker $SOURCE_ID ($APP_NAME)"
  flyctl machine clone \
    "$SOURCE_ID" \
    --app "$APP_NAME" \
    --standby-for=source
  verify_healthy_inventory
  echo "storage-worker topology repaired: $SOURCE_ID is active with a verified standby ($APP_NAME)"
  exit 0
fi

if [[ "$WORKER_COUNT" -ne 1 ||
  "$STARTED_COUNT" -ne 0 ||
  "$STANDBY_COUNT" -ne 1 ]]; then
  echo "::error::cannot safely repair storage-worker topology for $APP_NAME; observed=$(topology_summary)" >&2
  exit 1
fi

CANDIDATE_ID=$(jq -er '.[0].id' <<< "$STANDBY_WORKERS_JSON")

echo "repairing current-release storage-worker standby $CANDIDATE_ID ($APP_NAME)"
flyctl machine update \
  "$CANDIDATE_ID" \
  --app "$APP_NAME" \
  --standby-for '' \
  --yes

# Updating without --skip-start should start the former standby. Prove that
# before cloning it so a stopped Machine can never become the new source.
bash "$SCRIPT_DIR/verify-storage-worker-started.sh" "$APP_NAME"

flyctl machine clone \
  "$CANDIDATE_ID" \
  --app "$APP_NAME" \
  --standby-for=source

verify_healthy_inventory

echo "storage-worker topology repaired: $CANDIDATE_ID is active with a verified standby ($APP_NAME)"
