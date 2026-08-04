#!/usr/bin/env bash
# Static policy for Dependabot update grouping and PR trust boundaries.
# GitHub expressions below are intentionally literal static-test patterns.
# shellcheck disable=SC2016

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FAIL=0

pass() {
  echo "  ok   - $1"
}

fail() {
  echo "  FAIL - $1" >&2
  FAIL=$((FAIL + 1))
}

require_fixed() {
  local path="$1" needle="$2" description="$3"
  if grep -Fq -- "$needle" "$REPO_ROOT/$path"; then
    pass "$description"
  else
    fail "$description"
  fi
}

require_fixed_count() {
  local path="$1" needle="$2" expected="$3" description="$4"
  local actual
  actual="$(grep -Fc -- "$needle" "$REPO_ROOT/$path" || true)"
  if [[ "$actual" -eq "$expected" ]]; then
    pass "$description"
  else
    fail "$description (expected $expected, found $actual)"
  fi
}

forbid_fixed() {
  local path="$1" needle="$2" description="$3"
  if grep -Fq -- "$needle" "$REPO_ROOT/$path"; then
    fail "$description"
  else
    pass "$description"
  fi
}

job_body() {
  local path="$1" job="$2"
  awk -v header="  ${job}:" '
    $0 == header { in_job = 1 }
    in_job && $0 ~ /^  [^[:space:]][^:]*:$/ && $0 != header { exit }
    in_job { print }
  ' "$REPO_ROOT/$path"
}

require_job_fixed() {
  local path="$1" job="$2" needle="$3" description="$4"
  if job_body "$path" "$job" | grep -Fq -- "$needle"; then
    pass "$description"
  else
    fail "$description"
  fi
}

forbid_job_fixed() {
  local path="$1" job="$2" needle="$3" description="$4"
  if job_body "$path" "$job" | grep -Fq -- "$needle"; then
    fail "$description"
  else
    pass "$description"
  fi
}

echo "Dependabot trust policy"

DEPENDABOT_CONFIG=".github/dependabot.yml"
for group in \
  better-auth-stack \
  react-stack \
  astro-stack \
  drizzle-stack \
  aws-sdk-stack \
  typescript-eslint-stack \
  production-patches \
  development-patches; do
  require_fixed "$DEPENDABOT_CONFIG" "${group}:" \
    "Dependabot defines the ${group} update group"
done

for dependency in "expo*" "@expo/*" "react-native*" "@react-native/*"; do
  require_fixed "$DEPENDABOT_CONFIG" "dependency-name: '$dependency'" \
    "Dependabot leaves the Expo/native compatibility graph to Expo Doctor"
done

forbid_fixed "$DEPENDABOT_CONFIG" "production-minor-patch:" \
  "broad production grouping does not mix unrelated minor updates"
forbid_fixed "$DEPENDABOT_CONFIG" "development-minor-patch:" \
  "broad development grouping does not mix unrelated minor updates"
require_fixed ".github/actions/changed-paths/action.yml" \
  "- '.github/dependabot.yml'" \
  "Dependabot policy changes activate the CI policy-test job"
require_fixed ".github/workflows/lint-typecheck.yml" \
  "bash scripts/ci/__tests__/dependabot-trust-policy.test.sh" \
  "the credential-free lint workflow runs this policy test"

PULL_REQUEST_TARGET_FOUND=0
while IFS= read -r -d '' workflow; do
  if grep -Fq -- "pull_request_target:" "$workflow"; then
    fail "${workflow#"$REPO_ROOT"/} does not use pull_request_target"
    PULL_REQUEST_TARGET_FOUND=1
  fi
done < <(
  find "$REPO_ROOT/.github/workflows" -type f \
    \( -name '*.yml' -o -name '*.yaml' \) -print0
)
if [[ "$PULL_REQUEST_TARGET_FOUND" -eq 0 ]]; then
  pass "PR workflows never use pull_request_target"
fi

AUTHOR_GUARD="github.event.pull_request.user.login != 'dependabot[bot]'"
REPOSITORY_GUARD="github.event.pull_request.head.repo.full_name == github.repository"

for workflow in admin-preview site-preview; do
  path=".github/workflows/${workflow}.yml"
  require_job_fixed "$path" verify "permissions:" \
    "$workflow has a credential-free verification job"
  require_job_fixed "$path" verify "contents: read" \
    "$workflow verification is read-only"
  forbid_job_fixed "$path" verify '${{ secrets.' \
    "$workflow verification does not depend on repository secrets"
  forbid_job_fixed "$path" verify "pull-requests: write" \
    "$workflow verification cannot comment on pull requests"
  require_job_fixed "$path" deployment "needs: verify" \
    "$workflow deployment check waits for verification"
  require_job_fixed "$path" deployment "$AUTHOR_GUARD" \
    "$workflow deployment check excludes Dependabot by PR author"
  require_job_fixed "$path" deployment "$REPOSITORY_GUARD" \
    "$workflow deployment check excludes fork-controlled code"
  require_job_fixed "$path" deployment "pull-requests: write" \
    "$workflow keeps comment permission inside the guarded job"
  forbid_job_fixed "$path" deployment '${{ secrets.' \
    "$workflow deployment check is credential-free"
done

require_job_fixed ".github/workflows/dashboard-preview.yml" preview "$AUTHOR_GUARD" \
  "dashboard preview excludes Dependabot by PR author"
require_job_fixed ".github/workflows/dashboard-preview.yml" preview "$REPOSITORY_GUARD" \
  "dashboard preview excludes fork-controlled code"

require_job_fixed ".github/workflows/admin-preview.yml" verify \
  "pnpm --filter @harpa/admin test:e2e" \
  "admin verification keeps browser coverage"
require_job_fixed ".github/workflows/admin-preview.yml" deployment \
  "bash scripts/ci/verify-pages-deployment.sh" \
  "admin deployment check waits for the native Cloudflare Git build"

require_job_fixed ".github/workflows/site-preview.yml" verify \
  "PUBLIC_TURNSTILE_SITE_KEY: 1x00000000000000000000AA" \
  "site verification uses the checked-in public Turnstile test key"
forbid_job_fixed ".github/workflows/site-preview.yml" verify \
  "LHCI_GITHUB_APP_TOKEN" \
  "site Lighthouse verification does not require upload credentials"
require_job_fixed ".github/workflows/site-preview.yml" deployment \
  "bash scripts/ci/verify-pages-deployment.sh" \
  "site deployment check waits for the native Cloudflare Git build"

PR_PREVIEW=".github/workflows/pr-preview.yml"
for job in \
  neon-create \
  admin-neon-create \
  fly-preview \
  fly-destroy \
  neon-destroy \
  admin-neon-destroy; do
  require_job_fixed "$PR_PREVIEW" "$job" "$AUTHOR_GUARD" \
    "pr-preview $job excludes Dependabot by PR author"
  require_job_fixed "$PR_PREVIEW" "$job" "$REPOSITORY_GUARD" \
    "pr-preview $job excludes fork-controlled code"
done
forbid_job_fixed "$PR_PREVIEW" changes "$AUTHOR_GUARD" \
  "pr-preview keeps changed-path verification available to Dependabot"
forbid_job_fixed "$PR_PREVIEW" guard "$AUTHOR_GUARD" \
  "pr-preview keeps migration filename verification available to Dependabot"

require_job_fixed ".github/workflows/mobile-ota-pr.yml" ota "$AUTHOR_GUARD" \
  "PR OTA publication excludes Dependabot by PR author"
require_job_fixed ".github/workflows/mobile-ota-pr.yml" ota "$REPOSITORY_GUARD" \
  "PR OTA publication excludes fork-controlled code"

MAIN_GATE=".github/workflows/main-gate.yml"
require_job_fixed "$MAIN_GATE" journeys \
  "github.event.pull_request.user.login == 'dependabot[bot]'" \
  "main gate identifies direct Dependabot security pull requests"
require_job_fixed "$MAIN_GATE" journeys \
  "Port the dependency update through dev" \
  "main gate explains the safe security-update route"
require_fixed_count "$MAIN_GATE" "$AUTHOR_GUARD" 3 \
  "main gate keeps every live-dev journey step away from Dependabot credentials"

for workflow in \
  .github/workflows/admin-preview.yml \
  .github/workflows/pages-preview-ref.yml \
  .github/workflows/site-preview.yml \
  .github/workflows/pr-preview.yml \
  .github/workflows/mobile-ota-pr.yml \
  .github/workflows/main-gate.yml; do
  forbid_fixed "$workflow" "github.actor" \
    "${workflow##*/} trusts the immutable PR author rather than the rerun actor"
done

echo
echo "failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
