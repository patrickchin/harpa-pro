#!/usr/bin/env bash
# Resolve whether a push/manual/reusable invocation may publish an OTA.
# Writes the release SHA and policy booleans to GITHUB_OUTPUT.
set -euo pipefail

MOBILE_PATTERN="${MOBILE_PATH_PATTERN:?MOBILE_PATH_PATTERN required}"
API_PATTERN="${API_PATH_PATTERN:?API_PATH_PATTERN required}"
TAG_PREFIX="${RUNTIME_TAG_PREFIX:?RUNTIME_TAG_PREFIX required}"
API_WORKFLOW="${API_WORKFLOW_NAME:?API_WORKFLOW_NAME required}"
OUTPUT="${GITHUB_OUTPUT:?GITHUB_OUTPUT required}"
EVENT="${EVENT_NAME:?EVENT_NAME required}"
API_SUCCEEDED="${API_DEPLOY_SUCCEEDED:-false}"
REQUESTED="${REQUESTED_SHA:-}"
BEFORE="${PUSH_BEFORE:-}"

RELEASE_SHA="$(git rev-parse "${REQUESTED:-$GITHUB_SHA}^{commit}")"
git fetch --force --tags origin

BASE_SHA="$BEFORE"
if [[ -z "$BASE_SHA" || "$BASE_SHA" =~ ^0+$ ]] ||
  ! git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
  BASE_SHA="$(git rev-parse "${RELEASE_SHA}^")"
fi

CHANGED_PATHS="$(git diff --name-only "$BASE_SHA" "$RELEASE_SHA")"
MOBILE_CHANGED=false
API_CHANGED=false
if grep -Eq "$MOBILE_PATTERN" <<<"$CHANGED_PATHS"; then
  MOBILE_CHANGED=true
fi
if grep -Eq "$API_PATTERN" <<<"$CHANGED_PATHS"; then
  API_CHANGED=true
fi

read_version() {
  git show "$1:package.json" |
    node -e "
      let input = '';
      process.stdin.on('data', (chunk) => { input += chunk; });
      process.stdin.on('end', () => {
        process.stdout.write(JSON.parse(input).version);
      });
    "
}

BEFORE_VERSION="$(read_version "$BASE_SHA")"
AFTER_VERSION="$(read_version "$RELEASE_SHA")"
RUNTIME_CHANGED=false
if [[ "$BEFORE_VERSION" != "$AFTER_VERSION" ]]; then
  RUNTIME_CHANGED=true
fi

RUNTIME_TAG="${TAG_PREFIX}${AFTER_VERSION}"
RUNTIME_READY=false
NATIVE_DRIFT=false
if git rev-parse -q --verify "refs/tags/${RUNTIME_TAG}^{commit}" >/dev/null; then
  TAG_SHA="$(git rev-parse "refs/tags/${RUNTIME_TAG}^{commit}")"
  if git merge-base --is-ancestor "$TAG_SHA" "$RELEASE_SHA"; then
    NATIVE_PATHS="$(git diff --name-only "$TAG_SHA" "$RELEASE_SHA")"
    if grep -Eq '^(apps/mobile/(app\.config\.ts|eas\.json|package\.json|plugins/|ios/|android/)|pnpm-lock\.yaml$|patches/)' <<<"$NATIVE_PATHS"; then
      NATIVE_DRIFT=true
    else
      RUNTIME_READY=true
    fi
  fi
fi

MANUAL=false
if [[ "$EVENT" == "workflow_dispatch" ]]; then
  MANUAL=true
  MOBILE_CHANGED=true
fi

PUBLISH=true
REASON="release policy satisfied"
if [[ "$MOBILE_CHANGED" != "true" ]]; then
  PUBLISH=false
  REASON="no mobile OTA inputs changed"
elif [[ "$RUNTIME_READY" != "true" && "$NATIVE_DRIFT" == "true" ]]; then
  PUBLISH=false
  REASON="native inputs changed after $RUNTIME_TAG; bump appVersion and build"
elif [[ "$RUNTIME_READY" != "true" ]]; then
  PUBLISH=false
  REASON="register the distributed native artifact as $RUNTIME_TAG"
elif [[ "$API_CHANGED" == "true" &&
  "$MANUAL" != "true" &&
  "$API_SUCCEEDED" != "true" ]]; then
  PUBLISH=false
  REASON="API inputs changed; $API_WORKFLOW will publish after a successful deploy"
fi

{
  echo "release-sha=$RELEASE_SHA"
  echo "api-changed=$API_CHANGED"
  echo "runtime-changed=$RUNTIME_CHANGED"
  echo "runtime-ready=$RUNTIME_READY"
  echo "publish=$PUBLISH"
} >> "$OUTPUT"
echo "::notice::mobile OTA policy: $REASON"
