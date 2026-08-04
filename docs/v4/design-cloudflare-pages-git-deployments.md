# Cloudflare Pages Git deployments

**Status:** Implemented; dashboard production builds remain disabled

## Problem

GitHub Actions historically built each static application and published it
with Wrangler using long-lived `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repository secrets. That upload path did not establish
how the Pages projects were created: Git-integrated projects also accept manual
Wrangler deployments. Native Cloudflare Git is now active on the canonical
public and admin projects, so the credentialed GitHub publisher is redundant.

On 2026-08-05, the Cloudflare UI connected the existing
`harpa-pro-dashboard` Direct Upload project to `patrickchin/harpa-pro` in
place. Cloudflare preserved all seven existing deployments. No project
deletion or recreation occurred.

## Decision

Cloudflare Git is the only publisher for `harpa-pro`, `harpa-pro-admin`, and
`harpa-pro-dashboard`. GitHub Actions verifies deployments but does not call
the Cloudflare API.

The production branch remains `main`. Dashboard automatic production builds
remain disabled. During the draft rollout, dashboard preview builds are
restricted to the exact `pr-211` branch. After the application lands on `dev`,
that allowlist expands to `dev` and ephemeral `pr-*` branches. All three
projects keep the default `*` build watch include so every allowed branch
commit produces the exact-SHA marker expected by its verification workflow.

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
- `https://pr-<number>.harpa-pro-dashboard.pages.dev`.

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

The dashboard Pages project sets `SKIP_DEPENDENCY_INSTALL=1` and runs
`pnpm install --frozen-lockfile` explicitly before the build wrapper. This
keeps the repository-root `Gemfile.lock`, which belongs to native release
tooling, from making Pages install Ruby dependencies for a static web build.
It also makes the JavaScript dependency install use the committed lockfile.

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

## Dashboard provider outcome

The 2026-08-05 provider verification records this configuration:

- project: `harpa-pro-dashboard`;
- Git repository: `patrickchin/harpa-pro`;
- build command: an explicit `pnpm install --frozen-lockfile`, followed by
  `bash scripts/ci/build-cloudflare-pages.sh dashboard`;
- output directory: `apps/dashboard/dist`;
- preview build variable: `SKIP_DEPENDENCY_INSTALL=1`;
- production branch: `main`;
- automatic production deployments: disabled; and
- preview custom branch: `pr-211`; and
- build watch include: `*`.

Cloudflare preserved the seven existing preview deployments during the
in-place connection. The project has no production deployment or custom
domain. Production and `app.harpapro.com` activation require separate
approval.

The dashboard application remains isolated in
[draft PR #211](https://github.com/patrickchin/harpa-pro/pull/211). Restricting
the provider to that exact generated branch prevents unrelated `dev` or
`pr-*` commits from starting an absent-application build before the dashboard
lands, while the default watch include guarantees a deployment for every new
PR head. Expand the preview allowlist only after `apps/dashboard` reaches
`dev`. Automatic production deployments stay disabled until the application
reaches `main` through the protected promotion workflow.

## Verification and rollback

Verify the tokenless deployment contract as follows:

1. Run the shell policy suite and application builds locally.
2. Confirm the Cloudflare build command, output directory, and branch controls.
3. Verify an eligible pull request builds from `pr-<number>` at the exact head
   SHA and points at the matching Fly preview.
4. Merge through `dev` and verify the exact-SHA `dev` Pages deployment.
5. Confirm no Pages workflow or open branch contains Cloudflare credentials.

Rollback uses the Cloudflare Pages production rollback control for an active
production project. The current dashboard project has no production deployment
to roll back. Push a correction or pause Git builds if a preview fails. For an
active production project, use the Cloudflare Pages rollback control. Do not
restore credentialed Wrangler workflows or long-lived GitHub credentials.
