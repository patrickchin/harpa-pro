#!/usr/bin/env bash
# Keep local development, CI, Fly, EAS, and Node type declarations on one
# reviewed Node release. A broad engines range or workflow-local override can
# otherwise make the same command run under different majors.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
EXPECTED_NODE_VERSION="24.18.1"
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
  "$REPO_ROOT/.github/actions/setup-monorepo/action.yml" \
  "default: '$EXPECTED_NODE_VERSION'" \
  "shared CI setup uses the selected Node release"

assert_contains \
  "$REPO_ROOT/infra/fly/Dockerfile" \
  "FROM node:$EXPECTED_NODE_VERSION-alpine AS base" \
  "Fly runtime uses the selected Node release"

if grep -R -n --include='*.yml' --include='*.yaml' \
  'node-version:' "$REPO_ROOT/.github/workflows" >/tmp/harpa-node-version-overrides.txt; then
  fail "workflows inherit Node from the shared setup action"
  sed 's#^#         #' /tmp/harpa-node-version-overrides.txt
else
  pass "workflows inherit Node from the shared setup action"
fi
rm -f /tmp/harpa-node-version-overrides.txt

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

for (const manifest of [
  'package.json',
  'apps/cli/package.json',
  'apps/site/package.json',
  'packages/ai-fixtures/package.json',
]) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, manifest), 'utf8'));
  if (pkg.devDependencies?.['@types/node'] !== '^24.0.0') {
    throw new Error(`${manifest} has @types/node ${pkg.devDependencies?.['@types/node'] ?? 'missing'}`);
  }
}
NODE
then
  pass "EAS and Node type declarations use Node 24"
else
  fail "EAS and Node type declarations use Node 24"
fi

echo
echo "$PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
