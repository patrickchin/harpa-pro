# Cloudflare Pages Git deployments

**Status:** Implemented for public/admin; dashboard provider cutover pending

## Problem

Historical GitHub Actions workflows built each static application and
published it with Cloudflare credentials. The public and admin projects now
use Cloudflare Git, so GitHub only tests and verifies those deployments.

The dashboard still has a Direct Upload project. Cloudflare does not support
converting it to Git integration. The provider cutover therefore requires an
explicitly approved project recreation, not another workflow upload path.

## Decision

Cloudflare Git is the only publisher for `harpa-pro` and `harpa-pro-admin`.
It becomes the only publisher for `harpa-pro-dashboard` after the approved
provider recreation. GitHub Actions verifies deployments but does not call the
Cloudflare API.

The production branch remains `main`. Automatic preview builds are restricted
to `dev` and ephemeral `pr-*` branches. Build watch paths keep each monorepo
project isolated.

### Stable pull request branches

A credential-free workflow mirrors an eligible pull request head to the exact
Git ref `refs/heads/pr-<number>`:

- only human-owned, same-repository pull requests are mirrored;
- the workflow never checks out or executes pull request code while holding
  `contents: write`;
- synchronizing a pull request moves only its generated `pr-<number>` ref to
  the exact pull request head SHA; and
- closing the pull request deletes only that generated ref.

Cloudflare converts that ref into the stable aliases already used by the
system:

- `https://pr-<number>.harpa-pro.pages.dev`;
- `https://pr-<number>.harpa-pro-admin.pages.dev`; and
- `https://pr-<number>.harpa-pro-dashboard.pages.dev` after the dashboard
  project recreation.

This preserves `https://harpa-pro-api-pr-<number>.fly.dev`, the two Neon
`pr-<number>` branches, and the admin API's exact `ADMIN_CORS_ORIGINS` value.
It avoids branch-name sanitization logic and does not broaden the admin origin
allowlist.

### Build contract

Cloudflare invokes `scripts/ci/build-cloudflare-pages.sh <application>`. The
script fails closed for an unexpected branch and selects build-time public
configuration as follows:

| Branch        | Public site API | Admin/dashboard API  |
| ------------- | --------------- | -------------------- |
| `main`        | production      | production           |
| `dev`         | development     | development          |
| `pr-<number>` | production      | matching Fly preview |

Every successful build writes a non-sensitive deployment marker containing
`CF_PAGES_COMMIT_SHA` and `CF_PAGES_BRANCH`. Verification workflows poll the
stable Pages origin until that marker matches the expected Git SHA, then run
the surface-specific HTTP checks. A `200` from an old deployment is not
success.

The Turnstile site key remains a plain-text Cloudflare build variable because
it is intentionally shipped to browsers. Dashboard builds also receive public
password-account identities and an optional public Sentry DSN. Cloudflare
credentials do not remain in GitHub.

For dashboard builds, the wrapper exports `VITE_API_BASE_URL` from the branch.
Cloudflare supplies preview-only `VITE_PASSWORD_ACCOUNT_EMAILS` and optional
`VITE_SENTRY_DSN`. The wrapper derives `VITE_SENTRY_ENVIRONMENT` and
`VITE_SENTRY_RELEASE` from the branch and `CF_PAGES_COMMIT_SHA`.

## Workflow ownership

- `site-preview.yml`, `admin-preview.yml`, and `dashboard-preview.yml` retain
  credential-free local checks. They verify the stable Git deployment before
  any deployed browser checks.
- The site, admin, and dashboard dev/production workflows perform
  post-deployment verification only.
- `pages-preview-ref.yml` owns the exact `pr-<number>` Git ref lifecycle.
- Cloudflare owns build, deployment, GitHub build status, branch aliasing, and
  production rollback history.

No Pages workflow may reference `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `cloudflare/wrangler-action`, or a direct Pages
upload after the migration. Delete the two Cloudflare repository secrets only
after all workflow and branch checks satisfy that invariant.

## Dashboard boundary

The current `harpa-pro-dashboard` project cannot be connected in place. The
[Cloudflare Direct Upload documentation](https://developers.cloudflare.com/pages/get-started/direct-upload/)
requires a new Git-integrated project.

The provider snapshot on 2026-08-05 contains seven preview deployments. It has
no production deployment and no custom domain. Recreating the project deletes
those records and URLs, so an operator must approve the exact provider action.

The minimal migration recreates the same project name, restricts preview builds
to `dev` and `pr-*`, and keeps automatic production builds disabled.
Production and `app.harpapro.com` activation require separate approval.

## Verification and rollback

Before removing the GitHub secrets:

1. Run the shell policy suite and application builds locally.
2. Merge through `dev` and verify exact-SHA `dev` Pages deployments.
3. Verify an eligible pull request builds from `pr-<number>` at the exact head
   SHA and points at the matching Fly preview.
4. Promote through the protected `main` workflow and verify the exact SHA on
   every Pages and custom production hostname.
5. Confirm the repository and open deployment branches contain no Cloudflare
   credential references, then delete the two repository secrets.

Rollback uses the Cloudflare Pages production rollback control for an active
production project. The current dashboard project has no production deployment
to roll back. Pause Git builds or push a correction if its preview cutover
fails. Do not restore credentialed uploads.
