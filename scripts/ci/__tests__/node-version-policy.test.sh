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

if REPO_ROOT="$REPO_ROOT" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(
  process.env.REPO_ROOT,
  '.github/workflows/lint-typecheck.yml',
);
const lines = fs.readFileSync(workflowPath, 'utf8').split('\n');
const jobStart = lines.findIndex((line) => line === '  lint-typecheck:');
if (jobStart === -1) {
  throw new Error('lint-typecheck job is missing');
}

const nextJobOffset = lines
  .slice(jobStart + 1)
  .findIndex((line) => /^  [A-Za-z0-9_-]+:$/.test(line));
const jobEnd = nextJobOffset === -1 ? lines.length : jobStart + 1 + nextJobOffset;
const jobLines = lines.slice(jobStart, jobEnd);
const stepsStart = jobLines.findIndex((line) => line === '    steps:');
if (stepsStart === -1) {
  throw new Error('lint-typecheck steps are missing');
}
if (jobLines.slice(0, stepsStart).some((line) => line.startsWith('    if:'))) {
  throw new Error('lint-typecheck must not skip at the job level');
}

const policyStart = jobLines.findIndex(
  (line) => line === '      - name: Node version policy',
);
if (policyStart === -1) {
  throw new Error('standalone Node version policy step is missing');
}
const nextStepOffset = jobLines
  .slice(policyStart + 1)
  .findIndex((line) => line.startsWith('      - '));
const policyEnd =
  nextStepOffset === -1 ? jobLines.length : policyStart + 1 + nextStepOffset;
const policyLines = jobLines.slice(policyStart, policyEnd);
if (policyLines.some((line) => line.startsWith('        if:'))) {
  throw new Error('Node version policy step must run unconditionally');
}
if (
  !policyLines.includes(
    '        run: bash scripts/ci/__tests__/node-version-policy.test.sh',
  )
) {
  throw new Error('Node version policy step runs the wrong command');
}
NODE
then
  pass "required lint context always runs the Node version policy"
else
  fail "required lint context always runs the Node version policy"
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
