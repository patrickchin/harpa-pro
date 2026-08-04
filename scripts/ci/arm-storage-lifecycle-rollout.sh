#!/usr/bin/env bash
# Arm the monotonic storage-lifecycle rollout on one exact running Fly worker.
set -euo pipefail

if [[ "$#" -ne 1 || -z "$1" ]]; then
  echo "usage: $0 <fly-app-name>" >&2
  exit 64
fi

APP_NAME="$1"
ATTEMPTS="${STORAGE_LIFECYCLE_ARM_ATTEMPTS:-3}"
EXEC_TIMEOUT_SECONDS="${STORAGE_LIFECYCLE_ARM_TIMEOUT_SECONDS:-120}"
RETRY_DELAY_SECONDS="${STORAGE_LIFECYCLE_ARM_RETRY_DELAY_SECONDS:-5}"
ARM_COMMAND='env STORAGE_LEASE_ROLLOUT_GRACE_SEC=330 STORAGE_ACCOUNT_DELETE_ENABLED=true pnpm --filter @harpa/api storage:arm-leases'

if [[ ! "$ATTEMPTS" =~ ^[1-9][0-9]*$ || "$ATTEMPTS" -gt 10 ]]; then
  echo "STORAGE_LIFECYCLE_ARM_ATTEMPTS must be an integer from 1 to 10" >&2
  exit 64
fi
if [[ ! "$EXEC_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ||
      "$EXEC_TIMEOUT_SECONDS" -gt 600 ]]; then
  echo "STORAGE_LIFECYCLE_ARM_TIMEOUT_SECONDS must be an integer from 1 to 600" >&2
  exit 64
fi
if [[ ! "$RETRY_DELAY_SECONDS" =~ ^[0-9]+$ ||
      "$RETRY_DELAY_SECONDS" -gt 60 ]]; then
  echo "STORAGE_LIFECYCLE_ARM_RETRY_DELAY_SECONDS must be an integer from 0 to 60" >&2
  exit 64
fi

started_worker_id() {
  local machines_json
  local worker_id
  local worker_summary

  if ! machines_json=$(flyctl machines list --app "$APP_NAME" --json); then
    echo "::error::could not list Fly Machines before lifecycle arming ($APP_NAME)" >&2
    return 1
  fi

  if ! worker_id=$(
    jq -er '
      if type != "array" then
        error("expected a Machine array")
      else
        [
          .[]
          | select(
              .state == "started"
              and .config.metadata.fly_process_group == "storage-worker"
              and (.id | type == "string" and length > 0)
            )
        ] as $workers
        | if ($workers | length) != 1 then
            error("expected exactly one started storage-worker")
          else
            $workers[0].id
          end
      end
    ' <<< "$machines_json"
  ); then
    worker_summary=$(
      jq -c '
        if type == "array" then
          [
            .[]
            | select(.config.metadata.fly_process_group == "storage-worker")
            | {id, state}
          ]
        else
          {invalid_inventory_type: type}
        end
      ' <<< "$machines_json" 2>/dev/null || printf 'unparseable'
    )
    echo "::error::cannot choose one started storage-worker for $APP_NAME; observed=$worker_summary" >&2
    return 1
  fi

  printf '%s\n' "$worker_id"
}

WORKER_ID=$(started_worker_id)
echo "storage-lifecycle arming target: app=$APP_NAME machine=$WORKER_ID attempts=$ATTEMPTS timeout=${EXEC_TIMEOUT_SECONDS}s"

for ((attempt = 1; attempt <= ATTEMPTS; attempt++)); do
  echo "::group::storage-lifecycle arming attempt $attempt/$ATTEMPTS (machine=$WORKER_ID)"
  set +e
  EXEC_OUTPUT=$(
    flyctl machine exec \
      "$WORKER_ID" \
      "$ARM_COMMAND" \
      --app "$APP_NAME" \
      --timeout "$EXEC_TIMEOUT_SECONDS" 2>&1
  )
  EXEC_STATUS=$?
  set -e
  printf '%s\n' "$EXEC_OUTPUT"
  echo "::endgroup::"

  if [[ "$EXEC_STATUS" -eq 0 &&
        "$EXEC_OUTPUT" == *"[storage-lifecycle] lease enforcement armed for "* ]]; then
    echo "storage-lifecycle arming confirmed: app=$APP_NAME machine=$WORKER_ID attempt=$attempt"
    exit 0
  fi

  if [[ "$EXEC_STATUS" -eq 0 ]]; then
    echo "::warning::Machine exec returned success without the rollout confirmation marker" >&2
  else
    echo "::warning::Machine exec failed with status $EXEC_STATUS" >&2
  fi

  if [[ "$attempt" -eq "$ATTEMPTS" ]]; then
    break
  fi

  # A timed-out command may have committed before its transport failed. The
  # database update is monotonic, so retrying the same command is safe. Require
  # a fresh inventory to prove Fly still points at the same exact executor.
  RETRY_WORKER_ID=$(started_worker_id)
  if [[ "$RETRY_WORKER_ID" != "$WORKER_ID" ]]; then
    echo "::error::storage-worker target changed during arming: expected=$WORKER_ID observed=$RETRY_WORKER_ID" >&2
    exit 1
  fi
  echo "storage-lifecycle arming retrying in ${RETRY_DELAY_SECONDS}s on machine=$WORKER_ID"
  sleep "$RETRY_DELAY_SECONDS"
done

echo "::error::storage-lifecycle arming failed after $ATTEMPTS attempts on machine=$WORKER_ID ($APP_NAME)" >&2
exit 1
