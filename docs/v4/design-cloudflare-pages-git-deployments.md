# Cloudflare Pages Git deployments

**Status:** Implemented

## Problem

GitHub Actions historically built each static application and published it
with Wrangler using long-lived `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repository secrets. That upload path did not establish
how the Pages projects were created: Git-integrated projects also accept manual
Wrangler deployments. Native Cloudflare Git is now active on the canonical
public and admin projects, so the credentialed GitHub publisher is redundant.

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
to `dev` and ephemeral `pr-*` branches. Cloudflare's build watch include stays
at its default `*`, with no excludes. This ensures every managed branch commit
produces the exact-SHA marker that a triggered GitHub verification workflow
expects. Monorepo watch-path optimization is deferred until provider settings
and verifier-trigger parity can be enforced together.

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

The dashboard application is still isolated in
[draft PR #211](https://github.com/patrickchin/harpa-pro/pull/211). The
`harpa-pro-dashboard` project remains Git-integrated, but both automatic
production and preview branch deployments are disabled while `apps/dashboard`
is absent from `dev`. An absent application must not attach failed dashboard
builds to unrelated `dev` or `pr-*` refs.

Preview deployments are re-enabled only as part of a refreshed dashboard pull
request. Initially allow only that pull request's exact generated
`pr-<number>` ref, require its deployment marker and dashboard checks to match
the immutable pull request head SHA, then merge through `dev`. After the
application is present on `dev`, preview branch control may expand to `dev` and
`pr-*`. Automatic production deployments remain disabled until
`apps/dashboard` reaches `main` through the protected promotion workflow.

If the existing project is a Direct Upload project, create a replacement
Git-integrated project instead of attempting an unsupported in-place
conversion. A failed build of an absent application is not used as a rollout
mechanism.

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
the credentialed Wrangler workflows and long-lived GitHub credentials are not
restored.
