# Cloudflare Pages Git deployments

**Status:** Approved for implementation

## Problem

The public and admin Pages projects were created as Direct Upload projects.
GitHub Actions therefore built each static application and published it with
Wrangler using long-lived `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repository secrets. After the projects were connected
to `patrickchin/harpa-pro`, the production workflows and the native Cloudflare
Git build both published the same commit.

Removing only the production upload is incomplete. Development and pull
request workflows still use Wrangler, and the admin preview contract depends
on an exact `pr-<number>` Pages origin paired with the Fly and Neon preview of
the same number.

## Decision

Cloudflare Git is the only publisher for the `harpa-pro`,
`harpa-pro-admin`, and, once its application lands, `harpa-pro-dashboard`
Pages projects. GitHub Actions verifies deployments but does not call the
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
  the immutable pull request head SHA; and
- closing the pull request deletes only that generated ref.

Cloudflare converts that ref into the stable aliases already used by the
system:

- `https://pr-<number>.harpa-pro.pages.dev`;
- `https://pr-<number>.harpa-pro-admin.pages.dev`; and
- `https://pr-<number>.harpa-pro-dashboard.pages.dev` when the dashboard is
  connected.

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
it is intentionally shipped to browsers. Cloudflare credentials do not remain
in GitHub.

## Workflow ownership

- `site-preview.yml` and `admin-preview.yml` retain credential-free tests,
  browser checks, and Lighthouse checks. Their publication jobs become
  tokenless deployment verification and PR comments.
- `site-dev.yml`, `site-prod.yml`, `admin-dev.yml`, and `admin-prod.yml`
  become post-deployment verification only.
- `pages-preview-ref.yml` owns the exact `pr-<number>` Git ref lifecycle.
- Cloudflare owns build, deployment, GitHub build status, branch aliasing, and
  production rollback history.

No workflow may reference `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `cloudflare/wrangler-action`, or
`wrangler pages deploy` after the migration. The two Cloudflare repository
secrets are deleted only after the default branches and open deployment pull
requests satisfy that invariant.

## Dashboard boundary

The dashboard application is still isolated in its feature pull request. Its
existing Pages project may be connected immediately with automatic production
builds disabled and preview builds restricted to `pr-*`. Production is enabled
only after `apps/dashboard` reaches `main`; a failed build of an absent
application is not used as a rollout mechanism.

## Verification and rollback

Before removing the GitHub secrets:

1. Run the shell policy suite and application builds locally.
2. Merge through `dev` and verify exact-SHA `dev` Pages deployments.
3. Verify an eligible pull request builds from `pr-<number>` and that admin
   points at the matching Fly preview.
4. Promote through the protected `main` workflow and verify the exact SHA on
   every Pages and custom production hostname.
5. Confirm the repository and open deployment branches contain no Cloudflare
   credential references, then delete the two repository secrets.

Rollback uses the Cloudflare Pages production rollback control for a bad
static artifact. Git settings can temporarily disable automatic builds, but
the Direct Upload workflows and long-lived GitHub credentials are not restored.
