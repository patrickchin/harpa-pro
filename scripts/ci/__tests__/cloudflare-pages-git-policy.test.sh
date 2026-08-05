#!/usr/bin/env bash
# Static policy for tokenless Cloudflare Pages Git deployments.
# shellcheck disable=SC2016

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
failures=0

require() {
  local path="$1" needle="$2" description="$3"
  if grep -Fq -- "$needle" "$repo_root/$path"; then
    echo "  ok   - $description"
  else
    echo "  FAIL - $description" >&2
    failures=$((failures + 1))
  fi
}

job_body() {
  local path="$1" job="$2"
  awk -v header="  ${job}:" '
    $0 == header { in_job = 1 }
    in_job && $0 ~ /^  [^[:space:]][^:]*:$/ && $0 != header { exit }
    in_job { print }
  ' "$repo_root/$path"
}

require_job_line() {
  local path="$1" job="$2" needle="$3" description="$4"
  if job_body "$path" "$job" | grep -Fxq -- "$needle"; then
    echo "  ok   - $description"
  else
    echo "  FAIL - $description" >&2
    failures=$((failures + 1))
  fi
}

forbid_tree() {
  local needle="$1" description="$2"
  if grep -R -Fq -- "$needle" "$repo_root/.github/workflows"; then
    echo "  FAIL - $description" >&2
    failures=$((failures + 1))
  else
    echo "  ok   - $description"
  fi
}

echo "Cloudflare Pages Git policy"

forbid_tree 'CLOUDFLARE_API_TOKEN' 'workflows hold no Cloudflare API token'
forbid_tree 'CLOUDFLARE_ACCOUNT_ID' 'workflows hold no Cloudflare account id'
forbid_tree 'cloudflare/wrangler-action' 'workflows do not publish with Wrangler Action'
forbid_tree 'wrangler pages deploy' 'workflows do not publish with Wrangler CLI'

mirror=.github/workflows/pages-preview-ref.yml
require "$mirror" "github.event.pull_request.head.repo.full_name == github.repository" \
  'preview refs exclude fork-controlled heads'
require "$mirror" "github.event.pull_request.user.login != 'dependabot[bot]'" \
  'preview refs exclude Dependabot-controlled heads'
require "$mirror" 'contents: write' \
  'preview ref mutation has explicit scoped permission'
require "$mirror" 'const shortRef = `heads/pr-${number}`' \
  'preview ref name derives only from the numeric PR id'
require "$mirror" 'github.rest.git.updateRef' \
  'synchronize moves the exact generated ref'
require "$mirror" 'github.rest.git.deleteRef' \
  'close removes the exact generated ref'
if grep -Fq 'actions/checkout' "$repo_root/$mirror"; then
  echo '  FAIL - preview ref workflow must not execute pull-request code' >&2
  failures=$((failures + 1))
else
  echo '  ok   - preview ref workflow does not execute pull-request code'
fi

builder=scripts/ci/build-cloudflare-pages.sh
require "$builder" '^(main|dev|pr-[0-9]+)$' \
  'builder fails closed outside managed branches'
require "$builder" 'https://api.harpapro.com' \
  'builder declares the production API'
require "$builder" 'https://harpa-pro-api-dev.fly.dev' \
  'builder declares the development API'
require "$builder" 'https://harpa-pro-api-pr-${pr_number}.fly.dev' \
  'builder derives the exact PR API'
require "$builder" 'VITE_API_BASE_URL="$api_origin"' \
  'dashboard receives its Vite API variable'
require "$builder" 'VITE_SENTRY_RELEASE="$commit"' \
  'dashboard telemetry records the Cloudflare Git commit'
require "$builder" '_cf-pages-deployment.json' \
  'builder publishes an exact-SHA marker'

verifier=scripts/ci/verify-pages-deployment.sh
require "$verifier" '\"commit\":\"$expected_commit\"' \
  'verifier requires the expected commit marker'
require "$verifier" '\"branch\":\"$expected_branch\"' \
  'verifier requires the expected branch marker'
require "$verifier" 'PAGES_VERIFY_TIMEOUT_SEC:-4500' \
  'verifier allows 75 minutes for provider queue latency'

for workflow in site-preview admin-preview dashboard-preview; do
  require_job_line ".github/workflows/$workflow.yml" deployment \
    '    timeout-minutes: 90' \
    "$workflow deployment job keeps a 90-minute provider ceiling"
done

for workflow in site-dev admin-dev dashboard-dev; do
  require_job_line ".github/workflows/$workflow.yml" verify \
    '    timeout-minutes: 90' \
    "$workflow verify job keeps a 90-minute provider ceiling"
done

for workflow in \
  site-preview site-dev site-prod \
  admin-preview admin-dev admin-prod \
  dashboard-preview dashboard-dev dashboard-prod; do
  require ".github/workflows/$workflow.yml" \
    'bash scripts/ci/verify-pages-deployment.sh' \
    "$workflow verifies the native Git deployment"
done

echo
echo "failed: $failures"
[[ "$failures" -eq 0 ]]
