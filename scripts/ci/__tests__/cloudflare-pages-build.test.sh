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
  *'@harpa/ifc-viewer build:viewer'*)
    mkdir -p packages/ifc-viewer/dist/assets
    printf '<title>Local IFC viewer — Harpa Pro</title>\n' > packages/ifc-viewer/dist/index.html
    touch packages/ifc-viewer/dist/assets/web-ifc.wasm packages/ifc-viewer/dist/THIRD_PARTY_NOTICES.txt
    exit 0
    ;;
  *) echo "unexpected pnpm invocation: $*" >&2; exit 1 ;;
esac
mkdir -p "apps/$app/dist"
printf '<title>%s</title>\n' "$app" > "apps/$app/dist/index.html"
if [[ "$app" == dashboard ]]; then
  printf 'api=%s\npassword-accounts=%s\nsentry-environment=%s\nsentry-release=%s\n' \
    "${VITE_API_BASE_URL:-}" \
    "${VITE_PASSWORD_ACCOUNT_EMAILS:-}" \
    "${VITE_SENTRY_ENVIRONMENT:-}" \
    "${VITE_SENTRY_RELEASE:-}" > "apps/$app/dist/app.js"
else
  printf 'api=%s\nsite=%s\ndashboard=%s\n' \
    "${PUBLIC_API_BASE_URL:-}" \
    "${PUBLIC_SITE_BASE_URL:-}" \
    "${PUBLIC_DASHBOARD_URL:-}" > "apps/$app/dist/app.js"
  printf 'posthog-key=%s\nposthog-host=%s\n' \
    "${PUBLIC_POSTHOG_KEY:-}" "${PUBLIC_POSTHOG_HOST:-}" >> "apps/$app/dist/app.js"
fi
FAKE_PNPM
chmod +x "$sandbox/bin/pnpm"

sha=0123456789abcdef0123456789abcdef01234567

run_build() {
  local app="$1" branch="$2" expected_api="$3"
  local expected_site="${4:-}"
  local expected_dashboard="${5:-}"
  local expected_sentry_environment=""
  rm -rf -- "$sandbox/apps"
  (
    cd "$sandbox"
    PATH="$sandbox/bin:$PATH" \
    CF_PAGES_BRANCH="$branch" \
    CF_PAGES_COMMIT_SHA="$sha" \
    PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA \
    PUBLIC_POSTHOG_KEY=phc_production \
    PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com \
    VITE_PASSWORD_ACCOUNT_EMAILS='owner@example.com,editor@example.com' \
      bash scripts/ci/build-cloudflare-pages.sh "$app"
  )
  grep -Fq "$expected_api" "$sandbox/apps/$app/dist/app.js"
  grep -Fq "\"commit\":\"$sha\"" \
    "$sandbox/apps/$app/dist/_cf-pages-deployment.json"
  grep -Fq "\"branch\":\"$branch\"" \
    "$sandbox/apps/$app/dist/_cf-pages-deployment.json"
  test -f "$sandbox/apps/$app/dist/index.html"
  test ! -e "$sandbox/apps/$app/dist/404.html"

  if [[ "$app" == dashboard ]]; then
    case "$branch" in
      main) expected_sentry_environment=production ;;
      dev) expected_sentry_environment=development ;;
      pr-*) expected_sentry_environment=preview ;;
    esac
    grep -Fq 'password-accounts=owner@example.com,editor@example.com' \
      "$sandbox/apps/$app/dist/app.js"
    grep -Fq "sentry-environment=$expected_sentry_environment" \
      "$sandbox/apps/$app/dist/app.js"
    grep -Fq "sentry-release=$sha" "$sandbox/apps/$app/dist/app.js"
  elif [[ "$app" == site ]]; then
    grep -Fq "dashboard=$expected_dashboard" "$sandbox/apps/$app/dist/app.js"
    if [[ "$branch" == main ]]; then
      grep -Fxq 'posthog-key=phc_production' "$sandbox/apps/$app/dist/app.js"
      grep -Fxq 'posthog-host=https://eu.i.posthog.com' "$sandbox/apps/$app/dist/app.js"
    else
      grep -Fxq 'posthog-key=' "$sandbox/apps/$app/dist/app.js"
      grep -Fxq 'posthog-host=' "$sandbox/apps/$app/dist/app.js"
    fi
  elif [[ "$app" == admin ]]; then
    grep -Fq "site=$expected_site" "$sandbox/apps/$app/dist/app.js"
    grep -Fq "dashboard=$expected_dashboard" "$sandbox/apps/$app/dist/app.js"
  fi
}

run_build site main https://api.harpapro.com '' https://harpa-pro-dashboard.pages.dev
run_build site dev https://harpa-pro-api-dev.fly.dev '' https://dev.harpa-pro-dashboard.pages.dev
run_build site pr-42 https://api.harpapro.com '' https://pr-42.harpa-pro-dashboard.pages.dev
run_build admin main https://api.harpapro.com \
  https://harpa-pro.pages.dev https://harpa-pro-dashboard.pages.dev
run_build admin dev https://harpa-pro-api-dev.fly.dev \
  https://dev.harpa-pro.pages.dev https://dev.harpa-pro-dashboard.pages.dev
run_build admin pr-42 https://harpa-pro-api-pr-42.fly.dev \
  https://pr-42.harpa-pro.pages.dev https://pr-42.harpa-pro-dashboard.pages.dev
run_build dashboard main https://api.harpapro.com
run_build dashboard dev https://harpa-pro-api-dev.fly.dev
run_build dashboard pr-42 https://harpa-pro-api-pr-42.fly.dev

for viewer_branch in dev pr-42 main; do
  (
    cd "$sandbox"
    unset PUBLIC_TURNSTILE_SITE_KEY VITE_PASSWORD_ACCOUNT_EMAILS
    PATH="$sandbox/bin:$PATH" \
    CF_PAGES_BRANCH="$viewer_branch" \
    CF_PAGES_COMMIT_SHA="$sha" \
      bash scripts/ci/build-cloudflare-pages.sh viewer
  )
  grep -Fq "\"commit\":\"$sha\"" \
    "$sandbox/packages/ifc-viewer/dist/_cf-pages-deployment.json"
  grep -Fq "\"branch\":\"$viewer_branch\"" \
    "$sandbox/packages/ifc-viewer/dist/_cf-pages-deployment.json"
done

if (
  cd "$sandbox"
  unset VITE_PASSWORD_ACCOUNT_EMAILS
  PATH="$sandbox/bin:$PATH" \
  CF_PAGES_BRANCH=dev \
  CF_PAGES_COMMIT_SHA="$sha" \
    bash scripts/ci/build-cloudflare-pages.sh dashboard
) >/dev/null 2>&1; then
  echo 'dashboard unexpectedly built without password-account emails' >&2
  exit 1
fi

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

for invalid_preview_branch in pr-0 pr-01; do
  if (
    cd "$sandbox"
    PATH="$sandbox/bin:$PATH" \
    CF_PAGES_BRANCH="$invalid_preview_branch" \
    CF_PAGES_COMMIT_SHA="$sha" \
    PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA \
      bash scripts/ci/build-cloudflare-pages.sh site
  ) >/dev/null 2>&1; then
    echo "invalid preview branch unexpectedly built: $invalid_preview_branch" >&2
    exit 1
  fi
done

echo 'cloudflare-pages-build: ok'
