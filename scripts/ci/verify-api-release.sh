#!/usr/bin/env bash
# Verify that the API serving an OTA bundle is the expected release and is
# ready against its database. The health endpoint carries the image's short
# git SHA; the readiness endpoint checks the DB connection and migration head.
set -euo pipefail

HEALTH_URL="${API_HEALTH_URL:?API_HEALTH_URL required}"
READY_URL="${API_READY_URL:?API_READY_URL required}"
API_PATTERN="${API_PATH_PATTERN:?API_PATH_PATTERN required}"
EXPECTED_INPUT="${EXPECTED_GIT_COMMIT:?EXPECTED_GIT_COMMIT required}"
ATTEMPTS="${API_RELEASE_ATTEMPTS:-6}"
TIMEOUT="${API_RELEASE_TIMEOUT:-30}"
SLEEP_SECS="${API_RELEASE_SLEEP:-10}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! EXPECTED="$(git rev-parse --verify "${EXPECTED_INPUT}^{commit}" 2>/dev/null)"; then
  echo "Expected OTA release $EXPECTED_INPUT is unavailable in checkout history" >&2
  exit 1
fi

deployed_release_is_safe() {
  local reported="$1"
  local deployed
  local changed_paths

  if [[ ! "$reported" =~ ^[0-9a-f]{7,40}$ ]]; then
    echo "API health metadata has invalid gitCommit=${reported:-missing}" >&2
    return 1
  fi
  if ! deployed="$(git rev-parse --verify "${reported}^{commit}" 2>/dev/null)"; then
    echo "API deployed release $reported is unavailable in checkout history" >&2
    return 1
  fi

  if [[ "$deployed" == "$EXPECTED" ]]; then
    echo "API health metadata matches OTA release $reported"
    return 0
  fi
  if ! git merge-base --is-ancestor "$deployed" "$EXPECTED"; then
    echo "API deployed release $reported is not an ancestor of OTA release $EXPECTED" >&2
    return 1
  fi

  changed_paths="$(
    git log --format= --name-only -m "$deployed..$EXPECTED" |
      sed '/^$/d' |
      sort -u
  )"
  if grep -Eq "$API_PATTERN" <<<"$changed_paths"; then
    echo "API inputs changed between deployed release $reported and OTA release $EXPECTED; exact deployment required" >&2
    return 1
  fi

  echo "API deployed ancestor $reported is compatible with OTA release $EXPECTED"
}

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

    if deployed_release_is_safe "$actual"; then
      READYZ_URL="$READY_URL" \
        READYZ_ATTEMPTS="${READYZ_ATTEMPTS:-6}" \
        READYZ_TIMEOUT="${READYZ_TIMEOUT:-30}" \
        READYZ_SLEEP="${READYZ_SLEEP:-10}" \
        bash "$SCRIPT_DIR/verify-readyz.sh"
      exit 0
    fi

    echo "API release attempt $attempt is not compatible with OTA release $EXPECTED" >&2
  else
    echo "API release attempt $attempt could not read $HEALTH_URL" >&2
  fi

  if [[ "$attempt" -lt "$ATTEMPTS" ]]; then
    sleep "$SLEEP_SECS"
  fi
done

echo "API never served a compatible release for $EXPECTED after $ATTEMPTS attempts" >&2
exit 1
