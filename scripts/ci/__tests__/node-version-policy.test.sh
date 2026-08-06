#!/usr/bin/env bash
# Keep local development, CI, Fly, and EAS on one reviewed Node release.
# A broad engines range or workflow-local override can otherwise make the same
# command run under different majors.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
EXPECTED_NODE_VERSION="24.19.0"
PASS=0
FAIL=0

pass() {
  echo "  ok   - $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "  FAIL - $1"
  FAIL=$((FAIL + 1))
}

assert_file_equals() {
  local file="$1"
  local expected="$2"
  local description="$3"
  local actual=""

  if [[ -f "$file" ]]; then
    actual="$(tr -d '[:space:]' <"$file")"
  fi

  if [[ "$actual" == "$expected" ]]; then
    pass "$description"
  else
    fail "$description"
    echo "         expected '$expected', found '${actual:-missing}' in ${file#"$REPO_ROOT"/}"
  fi
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  local description="$3"

  if grep -Fq -- "$pattern" "$file"; then
    pass "$description"
  else
    fail "$description"
    echo "         missing '$pattern' in ${file#"$REPO_ROOT"/}"
  fi
}

echo "Node version policy"

assert_file_equals \
  "$REPO_ROOT/.nvmrc" \
  "$EXPECTED_NODE_VERSION" \
  "local NVM selection is exact"

assert_contains \
  "$REPO_ROOT/package.json" \
  "\"node\": \">=$EXPECTED_NODE_VERSION <25\"" \
  "package engines require the selected Node 24 baseline"

assert_contains \
  "$REPO_ROOT/.npmrc" \
  "engine-strict=true" \
  "pnpm rejects commands under a different Node major"

assert_contains \
  "$REPO_ROOT/.github/actions/setup-monorepo/action.yml" \
  "default: '$EXPECTED_NODE_VERSION'" \
  "shared CI setup uses the selected Node release"

assert_contains \
  "$REPO_ROOT/infra/fly/Dockerfile" \
  "FROM node:$EXPECTED_NODE_VERSION-alpine AS base" \
  "Fly runtime uses the selected Node release"

workflow_overrides="$(
  grep -R -n --include='*.yml' --include='*.yaml' \
    'node-version:' "$REPO_ROOT/.github/workflows" || true
)"
if [[ -n "$workflow_overrides" ]]; then
  fail "workflows inherit Node from the shared setup action"
  while IFS= read -r workflow_override; do
    printf '         %s\n' "$workflow_override"
  done <<<"$workflow_overrides"
else
  pass "workflows inherit Node from the shared setup action"
fi

if EXPECTED_NODE_VERSION="$EXPECTED_NODE_VERSION" REPO_ROOT="$REPO_ROOT" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const expected = process.env.EXPECTED_NODE_VERSION;
const root = process.env.REPO_ROOT;
const eas = JSON.parse(fs.readFileSync(path.join(root, 'apps/mobile/eas.json'), 'utf8'));
for (const profile of ['development', 'preview', 'production']) {
  if (eas.build?.[profile]?.node !== expected) {
    throw new Error(`EAS ${profile} uses ${eas.build?.[profile]?.node ?? 'no Node version'}`);
  }
}
NODE
then
  pass "EAS native builds use the selected Node release"
else
  fail "EAS native builds use the selected Node release"
fi

echo
echo "$PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
