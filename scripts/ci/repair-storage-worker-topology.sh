#!/usr/bin/env bash
# Repair only exact current-release Fly storage-worker singleton failure and
# retry states; every mutation is followed by a fresh topology proof.
set -euo pipefail

if [[ "$#" -ne 1 || -z "$1" ]]; then
  echo "usage: $0 <fly-app-name>" >&2
  exit 64
fi

APP_NAME="$1"
START_MAX_ATTEMPTS="${STORAGE_WORKER_START_MAX_ATTEMPTS:-10}"
START_POLL_SECONDS="${STORAGE_WORKER_START_POLL_SECONDS:-3}"

if [[ ! "$START_MAX_ATTEMPTS" =~ ^[1-9][0-9]*$ ||
  ! "$START_POLL_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "::error::storage-worker start poll bounds must be nonnegative integers with at least one attempt" >&2
  exit 64
fi

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
  STOPPED_RECOVERY_WORKERS_JSON=$(
    jq -c '
      [
        .[]
        | select(.config.metadata.fly_process_group == "storage-worker")
        | select(.state == "stopped")
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
  STARTED_COUNT=$(jq -r 'length' <<< "$STARTED_WORKERS_JSON")
  STANDBY_COUNT=$(jq -r 'length' <<< "$STANDBY_WORKERS_JSON")
  STOPPED_RECOVERY_COUNT=$(jq -r 'length' <<< "$STOPPED_RECOVERY_WORKERS_JSON")
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

load_exact_candidate_transition() {
  local candidate_id="$1"
  local transition="$2"

  load_inventory
  validate_deployed_identity "$INVENTORY_JSON"
  if ! CANDIDATE_STATE=$(
    jq -er --arg candidate_id "$candidate_id" '
      [
        .[]
        | select(.config.metadata.fly_process_group == "storage-worker")
      ] as $workers
      | if
          ($workers | length) == 1
          and $workers[0].id == $candidate_id
          and (($workers[0].config.services // []) | type) == "array"
          and (($workers[0].config.services // []) | length) == 0
          and (($workers[0].config.standbys // []) | type) == "array"
          and (($workers[0].config.standbys // []) | length) == 0
          and (
            ["stopped", "starting", "started"]
            | index($workers[0].state)
          ) != null
        then
          $workers[0].state
        else
          empty
        end
    ' <<< "$INVENTORY_JSON"
  ); then
    echo "::error::storage-worker candidate $candidate_id was not the sole current-release service-less worker without standby configuration $transition for $APP_NAME; observed=$(topology_summary)" >&2
    return 1
  fi
}

wait_for_candidate_started() {
  local candidate_id="$1"
  local attempt

  for ((attempt = 1; attempt <= START_MAX_ATTEMPTS; attempt++)); do
    load_exact_candidate_transition \
      "$candidate_id" \
      "while waiting for explicit start"
    if [[ "$CANDIDATE_STATE" == "started" ]]; then
      return 0
    fi
    if [[ "$attempt" -lt "$START_MAX_ATTEMPTS" ]]; then
      sleep "$START_POLL_SECONDS"
    fi
  done

  echo "::error::storage-worker candidate $candidate_id did not reach started after $START_MAX_ATTEMPTS fresh inventory checks for $APP_NAME; last_state=$CANDIDATE_STATE" >&2
  return 1
}

start_and_verify_candidate() {
  local candidate_id="$1"

  echo "starting current-release storage-worker $candidate_id ($APP_NAME)"
  flyctl machine start "$candidate_id" --app "$APP_NAME"
  wait_for_candidate_started "$candidate_id"
}

verify_candidate_started_before_clone() {
  local candidate_id="$1"

  load_exact_candidate_transition \
    "$candidate_id" \
    "immediately before cloning its standby"
  if [[ "$CANDIDATE_STATE" != "started" ]]; then
    echo "::error::storage-worker candidate $candidate_id was no longer started immediately before cloning for $APP_NAME; observed=$(topology_summary)" >&2
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
  verify_candidate_started_before_clone "$SOURCE_ID"
  echo "restoring standby for current-release storage-worker $SOURCE_ID ($APP_NAME)"
  flyctl machine clone \
    "$SOURCE_ID" \
    --app "$APP_NAME" \
    --standby-for=source
  verify_healthy_inventory
  echo "storage-worker topology repaired: $SOURCE_ID is active with a verified standby ($APP_NAME)"
  exit 0
fi

if [[ "$WORKER_COUNT" -eq 1 &&
  "$STARTED_COUNT" -eq 0 &&
  "$STANDBY_COUNT" -eq 0 &&
  "$STOPPED_RECOVERY_COUNT" -eq 1 ]]; then
  CANDIDATE_ID=$(jq -er '.[0].id' <<< "$STOPPED_RECOVERY_WORKERS_JSON")
  echo "retrying stopped current-release storage-worker $CANDIDATE_ID ($APP_NAME)"
  start_and_verify_candidate "$CANDIDATE_ID"
  verify_candidate_started_before_clone "$CANDIDATE_ID"

  flyctl machine clone \
    "$CANDIDATE_ID" \
    --app "$APP_NAME" \
    --standby-for=source

  verify_healthy_inventory
  echo "storage-worker topology repaired: $CANDIDATE_ID is active with a verified standby ($APP_NAME)"
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

load_exact_candidate_transition \
  "$CANDIDATE_ID" \
  "after clearing standby configuration"

case "$CANDIDATE_STATE" in
  stopped)
    start_and_verify_candidate "$CANDIDATE_ID"
    ;;
  starting)
    wait_for_candidate_started "$CANDIDATE_ID"
    ;;
  started)
    ;;
esac

verify_candidate_started_before_clone "$CANDIDATE_ID"

flyctl machine clone \
  "$CANDIDATE_ID" \
  --app "$APP_NAME" \
  --standby-for=source

verify_healthy_inventory

echo "storage-worker topology repaired: $CANDIDATE_ID is active with a verified standby ($APP_NAME)"
