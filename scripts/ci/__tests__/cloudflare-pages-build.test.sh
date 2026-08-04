#!/usr/bin/env bash
# Behaviour tests for the branch-to-environment Pages build wrapper.

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
sandbox=$(mktemp -d)
trap 'rm -rf -- "$sandbox"' EXIT

mkdir -p "$sandbox/scripts/ci" "$sandbox/bin"
cp "$repo_root/scripts/ci/build-cloudflare-pages.sh" "$sandbox/scripts/ci/"

cat > "$sandbox/bin/pnpm" <<'FAKE_PNPM'
#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  *'@harpa/site build'*) app=site ;;
  *'@harpa/admin build'*) app=admin ;;
  *'@harpa/dashboard build'*) app=dashboard ;;
  *) echo "unexpected pnpm invocation: $*" >&2; exit 1 ;;
esac
mkdir -p "apps/$app/dist"
printf 'api=%s\n' "${PUBLIC_API_BASE_URL:-}" > "apps/$app/dist/app.js"
FAKE_PNPM
chmod +x "$sandbox/bin/pnpm"

sha=0123456789abcdef0123456789abcdef01234567

run_build() {
  local app="$1" branch="$2" expected_api="$3"
  rm -rf -- "$sandbox/apps"
  (
    cd "$sandbox"
    PATH="$sandbox/bin:$PATH" \
    CF_PAGES_BRANCH="$branch" \
    CF_PAGES_COMMIT_SHA="$sha" \
    PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA \
      bash scripts/ci/build-cloudflare-pages.sh "$app"
  )
  grep -Fq "$expected_api" "$sandbox/apps/$app/dist/app.js"
  grep -Fq "\"commit\":\"$sha\"" \
    "$sandbox/apps/$app/dist/_cf-pages-deployment.json"
  grep -Fq "\"branch\":\"$branch\"" \
    "$sandbox/apps/$app/dist/_cf-pages-deployment.json"
}

run_build site main https://api.harpapro.com
run_build site dev https://harpa-pro-api-dev.fly.dev
run_build site pr-42 https://api.harpapro.com
run_build admin main https://api.harpapro.com
run_build admin dev https://harpa-pro-api-dev.fly.dev
run_build admin pr-42 https://harpa-pro-api-pr-42.fly.dev
run_build dashboard pr-42 https://harpa-pro-api-pr-42.fly.dev

if (
  cd "$sandbox"
  PATH="$sandbox/bin:$PATH" \
  CF_PAGES_BRANCH=feature-branch \
  CF_PAGES_COMMIT_SHA="$sha" \
  PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA \
    bash scripts/ci/build-cloudflare-pages.sh site
) >/dev/null 2>&1; then
  echo 'unsupported branch unexpectedly built' >&2
  exit 1
fi

echo 'cloudflare-pages-build: ok'
