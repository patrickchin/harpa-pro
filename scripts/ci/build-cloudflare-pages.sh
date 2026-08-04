#!/usr/bin/env bash
# Build one static Pages application from Cloudflare's Git build environment.

set -euo pipefail

application="${1:-}"
branch="${CF_PAGES_BRANCH:-}"
commit="${CF_PAGES_COMMIT_SHA:-}"

if [[ ! "$branch" =~ ^(main|dev|pr-[0-9]+)$ ]]; then
  echo "ERROR: unsupported Cloudflare Pages branch: ${branch:-<unset>}" >&2
  exit 1
fi
if [[ ! "$commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: CF_PAGES_COMMIT_SHA must be a full lowercase Git SHA" >&2
  exit 1
fi

case "$branch" in
  main)
    api_origin=https://api.harpapro.com
    dashboard_sentry_environment=production
    ;;
  dev)
    api_origin=https://harpa-pro-api-dev.fly.dev
    dashboard_sentry_environment=development
    ;;
  pr-*)
    pr_number="${branch#pr-}"
    api_origin="https://harpa-pro-api-pr-${pr_number}.fly.dev"
    dashboard_sentry_environment=preview
    ;;
esac

case "$application" in
  site)
    : "${PUBLIC_TURNSTILE_SITE_KEY:?PUBLIC_TURNSTILE_SITE_KEY is required}"
    # Preserve the existing public-site preview contract: PR builds submit to
    # production, while the stable dev branch submits to the development API.
    if [[ "$branch" == pr-* ]]; then
      api_origin=https://api.harpapro.com
    fi
    output_dir=apps/site/dist
    PUBLIC_API_BASE_URL="$api_origin" pnpm --filter @harpa/site build
    test ! -e "$output_dir/admin"
    ;;
  admin)
    output_dir=apps/admin/dist
    PUBLIC_API_BASE_URL="$api_origin" pnpm --filter @harpa/admin build
    grep -R -Fq --include='*.js' "$api_origin" "$output_dir"
    if grep -R -Fq --include='*.js' 'http://localhost:8787' "$output_dir"; then
      echo "ERROR: admin artifact still points at the local E2E API" >&2
      exit 1
    fi
    ;;
  dashboard)
    output_dir=apps/dashboard/dist
    # VITE_PASSWORD_ACCOUNT_EMAILS and the optional VITE_SENTRY_DSN remain
    # Cloudflare Pages build variables and are inherited by this command.
    VITE_API_BASE_URL="$api_origin" \
      VITE_SENTRY_ENVIRONMENT="$dashboard_sentry_environment" \
      VITE_SENTRY_RELEASE="$commit" \
      pnpm --filter @harpa/dashboard build
    grep -R -Fq --include='*.js' "$api_origin" "$output_dir"
    if grep -R -Fq --include='*.js' 'http://localhost:8787' "$output_dir"; then
      echo "ERROR: dashboard artifact still points at the local E2E API" >&2
      exit 1
    fi
    test -f "$output_dir/index.html"
    if [[ -e "$output_dir/404.html" ]]; then
      echo "ERROR: a top-level 404.html disables Cloudflare Pages SPA routing" >&2
      exit 1
    fi
    ;;
  *)
    echo "ERROR: expected application: site, admin, or dashboard" >&2
    exit 1
    ;;
esac

printf '{"commit":"%s","branch":"%s"}\n' "$commit" "$branch" \
  > "$output_dir/_cf-pages-deployment.json"
