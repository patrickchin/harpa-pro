#!/usr/bin/env bash
# Verify that a deployed API is serving the commit this CI job is testing.
#
# The API exposes its full build-time SHA at /healthz.gitCommit. It must equal
# the full PR head SHA exactly; abbreviated prefixes are intentionally rejected.
# A bounded retry loop tolerates a Fly machine cold start or a deployment that
# is finishing while the gate begins.
set -euo pipefail

URL="${HEALTH_URL:?HEALTH_URL required}"
EXPECTED="${EXPECTED_GIT_COMMIT:?EXPECTED_GIT_COMMIT required}"
ATTEMPTS="${DEPLOY_SHA_ATTEMPTS:-6}"
TIMEOUT="${DEPLOY_SHA_TIMEOUT:-20}"
SLEEP_SECS="${DEPLOY_SHA_SLEEP:-10}"

EXPECTED="${EXPECTED,,}"
if [[ ! "$EXPECTED" =~ ^[0-9a-f]{40}$ ]]; then
  echo "EXPECTED_GIT_COMMIT must be a full 40-character hexadecimal SHA" >&2
  exit 1
fi

extract_git_commit() {
  node -e '
    let body = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { body += chunk; });
    process.stdin.on("end", () => {
      try {
        const value = JSON.parse(body).gitCommit;
        if (typeof value !== "string") process.exit(1);
        process.stdout.write(value);
      } catch {
        process.exit(1);
      }
    });
  '
}

for attempt in $(seq 1 "$ATTEMPTS"); do
  body=""
  actual=""
  if body="$(curl --fail --silent --show-error --max-time "$TIMEOUT" "$URL")"; then
    actual="$(printf '%s' "$body" | extract_git_commit || true)"
    actual="${actual,,}"
    if [[ "$actual" =~ ^[0-9a-f]{40}$ && "$actual" == "$EXPECTED" ]]; then
      echo "deployed commit $actual exactly matches expected PR head"
      exit 0
    fi
    if [[ -n "$actual" ]]; then
      echo "deployment reports $actual; waiting for expected ${EXPECTED:0:12}"
    else
      echo "health response did not contain a full 40-character gitCommit"
    fi
  else
    echo "health check attempt $attempt failed"
  fi

  if [[ "$attempt" -lt "$ATTEMPTS" ]]; then
    sleep "$SLEEP_SECS"
  fi
done

echo "deployment did not reach expected commit ${EXPECTED:0:12} after $ATTEMPTS attempts" >&2
exit 1
