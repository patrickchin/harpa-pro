#!/usr/bin/env bash
# Create the immutable tag that attests a native artifact was built and
# distributed for an environment/appVersion pair. Run only from the
# write-scoped workflow_dispatch registration job.
set -euo pipefail

TARGET="${TARGET_BRANCH:?TARGET_BRANCH required}"
ENVIRONMENT="${RUNTIME_ENVIRONMENT:?RUNTIME_ENVIRONMENT required}"
TAG_PREFIX="${RUNTIME_TAG_PREFIX:?RUNTIME_TAG_PREFIX required}"
ARTIFACT="${NATIVE_ARTIFACT:-}"
CONFIRMED="${NATIVE_RUNTIME_READY:-false}"
RELEASE_SHA="$(git rev-parse HEAD)"

git fetch --force --tags origin "${TARGET}:refs/remotes/origin/${TARGET}"
if ! git merge-base --is-ancestor "$RELEASE_SHA" "origin/$TARGET"; then
  echo "::error::release SHA must belong to $TARGET" >&2
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
RUNTIME_TAG="${TAG_PREFIX}${VERSION}"
if git rev-parse -q --verify "refs/tags/${RUNTIME_TAG}^{commit}" >/dev/null; then
  TAG_SHA="$(git rev-parse "refs/tags/${RUNTIME_TAG}^{commit}")"
  if ! git merge-base --is-ancestor "$TAG_SHA" "$RELEASE_SHA"; then
    echo "::error::$RUNTIME_TAG does not belong to this release history" >&2
    exit 1
  fi
  echo "::notice::$RUNTIME_TAG already attests the $ENVIRONMENT runtime"
  exit 0
fi

if [[ "$CONFIRMED" != "true" ]]; then
  echo "::error::confirm the $ENVIRONMENT binary was built and distributed" >&2
  exit 1
fi
if [[ -z "${ARTIFACT//[[:space:]]/}" ]]; then
  echo "::error::native_artifact must identify the distributed build" >&2
  exit 1
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git tag -a "$RUNTIME_TAG" "$RELEASE_SHA" \
  -m "$RUNTIME_TAG" \
  -m "Environment: $ENVIRONMENT" \
  -m "Artifact: $ARTIFACT"
git push origin "refs/tags/$RUNTIME_TAG"
