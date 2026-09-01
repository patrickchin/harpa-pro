#!/usr/bin/env bash
# Prove that pr-preview successfully provisioned the Fly app for this PR head.
# The caller must run this before sending journey credentials to the preview.
set -euo pipefail

REPOSITORY="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required}"
HEAD_SHA="${PR_HEAD_SHA:?PR_HEAD_SHA required}"
WORKFLOW_FILE="${PREVIEW_WORKFLOW_FILE:-pr-preview.yml}"
ATTEMPTS="${PREVIEW_RUN_ATTEMPTS:-90}"
SLEEP_SECS="${PREVIEW_RUN_SLEEP:-10}"
: "${GH_TOKEN:?GH_TOKEN required}"

if [[ ! "$HEAD_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "PR_HEAD_SHA must be a full 40-character lowercase hexadecimal SHA" >&2
  exit 1
fi
if [[ ! "$ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  echo "PREVIEW_RUN_ATTEMPTS must be a positive integer" >&2
  exit 1
fi
if [[ ! "$SLEEP_SECS" =~ ^[0-9]+$ ]]; then
  echo "PREVIEW_RUN_SLEEP must be a non-negative integer" >&2
  exit 1
fi

query_run() {
  gh api --method GET \
    "repos/$REPOSITORY/actions/workflows/$WORKFLOW_FILE/runs" \
    -f event=pull_request \
    -f "head_sha=$HEAD_SHA" \
    -f per_page=10 \
    --jq '.workflow_runs | sort_by(.created_at) | reverse | .[0] | if . == null then "" else [.id, .status, (.conclusion // "")] | @tsv end'
}

query_fly_preview_job() {
  local run_id="$1"
  gh api --method GET \
    "repos/$REPOSITORY/actions/runs/$run_id/jobs" \
    -f per_page=100 \
    --jq '.jobs[] | select(.name == "fly-preview") | [.status, (.conclusion // "")] | @tsv'
}

for attempt in $(seq 1 "$ATTEMPTS"); do
  run_record=""
  if ! run_record="$(query_run)"; then
    echo "preview provenance lookup failed for head ${HEAD_SHA:0:12}" >&2
    exit 1
  fi

  run_id=""
  run_status=""
  run_conclusion=""
  if [[ -n "$run_record" ]]; then
    IFS=$'\t' read -r run_id run_status run_conclusion <<< "$run_record"
  fi

  if [[ -n "$run_id" ]]; then
    if [[ "$run_status" == "completed" && "$run_conclusion" != "success" ]]; then
      echo "pr-preview workflow run $run_id concluded ${run_conclusion:-unknown}" >&2
      exit 1
    fi

    job_record=""
    if ! job_record="$(query_fly_preview_job "$run_id")"; then
      echo "fly-preview job lookup failed for workflow run $run_id" >&2
      exit 1
    fi

    job_status=""
    job_conclusion=""
    if [[ -n "$job_record" ]]; then
      IFS=$'\t' read -r job_status job_conclusion <<< "$job_record"
    fi

    if [[ "$job_status" == "completed" ]]; then
      if [[ "$job_conclusion" == "success" ]]; then
        echo "pr-preview run $run_id provisioned fly-preview for exact head $HEAD_SHA"
        exit 0
      fi
      echo "fly-preview concluded ${job_conclusion:-unknown} in workflow run $run_id" >&2
      exit 1
    fi

    if [[ "$run_status" == "completed" && -z "$job_status" ]]; then
      echo "pr-preview workflow run $run_id completed without a fly-preview job" >&2
      exit 1
    fi

    echo "pr-preview run $run_id is ${run_status:-unknown}; fly-preview is ${job_status:-pending}"
  else
    echo "waiting for pr-preview workflow for exact head ${HEAD_SHA:0:12}"
  fi

  if [[ "$attempt" -lt "$ATTEMPTS" ]]; then
    sleep "$SLEEP_SECS"
  fi
done

echo "no successful fly-preview job appeared for exact head ${HEAD_SHA:0:12} after $ATTEMPTS attempts" >&2
exit 1
