#!/usr/bin/env bash
# Verify that the API serving an OTA bundle is the expected release and is
# ready against its database. The health endpoint carries the image's short
# git SHA; the readiness endpoint checks the DB connection and migration head.
set -euo pipefail

HEALTH_URL="${API_HEALTH_URL:?API_HEALTH_URL required}"
READY_URL="${API_READY_URL:?API_READY_URL required}"
EXPECTED="${EXPECTED_GIT_COMMIT:?EXPECTED_GIT_COMMIT required}"
ATTEMPTS="${API_RELEASE_ATTEMPTS:-6}"
TIMEOUT="${API_RELEASE_TIMEOUT:-30}"
SLEEP_SECS="${API_RELEASE_SLEEP:-10}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

for attempt in $(seq 1 "$ATTEMPTS"); do
  body=""
  if body="$(curl --fail --silent --show-error --max-time "$TIMEOUT" "$HEALTH_URL")"; then
    actual="$(
      printf '%s' "$body" |
        node -e "
          let input = '';
          process.stdin.setEncoding('utf8');
          process.stdin.on('data', (chunk) => { input += chunk; });
          process.stdin.on('end', () => {
            const value = JSON.parse(input).gitCommit;
            if (typeof value !== 'string') process.exit(1);
            process.stdout.write(value);
          });
        "
    )" || actual=""

    if [[ "$actual" =~ ^[0-9a-f]{7,40}$ && "$EXPECTED" == "$actual"* ]]; then
      echo "API health metadata matches release $actual"
      READYZ_URL="$READY_URL" \
        READYZ_ATTEMPTS="${READYZ_ATTEMPTS:-6}" \
        READYZ_TIMEOUT="${READYZ_TIMEOUT:-30}" \
        READYZ_SLEEP="${READYZ_SLEEP:-10}" \
        bash "$SCRIPT_DIR/verify-readyz.sh"
      exit 0
    fi

    echo "API release attempt $attempt served gitCommit=${actual:-missing}; expected prefix of $EXPECTED" >&2
  else
    echo "API release attempt $attempt could not read $HEALTH_URL" >&2
  fi

  if [[ "$attempt" -lt "$ATTEMPTS" ]]; then
    sleep "$SLEEP_SECS"
  fi
done

echo "API never served expected release $EXPECTED after $ATTEMPTS attempts" >&2
exit 1
