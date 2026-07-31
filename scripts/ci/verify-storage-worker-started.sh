#!/usr/bin/env bash
# Fail closed unless Fly reports a started storage lifecycle worker.
set -euo pipefail

if [[ "$#" -ne 1 || -z "$1" ]]; then
  echo "usage: $0 <fly-app-name>" >&2
  exit 64
fi

APP_NAME="$1"
MACHINES_JSON=$(flyctl machines list --app "$APP_NAME" --json)

if ! STARTED_COUNT=$(
  jq -er '
    if type != "array" then
      error("expected a Machine array")
    else
      [
        .[]
        | select(
            .state == "started"
            and .config.metadata.fly_process_group == "storage-worker"
          )
      ]
      | length
    end
  ' <<< "$MACHINES_JSON"
); then
  echo "::error::invalid Fly Machine inventory for $APP_NAME" >&2
  exit 1
fi

if [[ "$STARTED_COUNT" -lt 1 ]]; then
  WORKER_SUMMARY=$(
    jq -c '
      [
        .[]
        | select(.config.metadata.fly_process_group == "storage-worker")
        | {id, state}
      ]
    ' <<< "$MACHINES_JSON"
  )
  echo "::error::no started storage-worker Machine for $APP_NAME; observed=$WORKER_SUMMARY" >&2
  exit 1
fi

echo "storage-worker ready: $STARTED_COUNT started ($APP_NAME)"
