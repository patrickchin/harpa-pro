# Separate admin site

**Status:** Approved for implementation (2026-08-01)

## Problem

The business activity console currently lives at
`apps/site/src/pages/admin/activity.astro`. Cloudflare Pages therefore includes
the admin shell in the same static artifact that serves `harpapro.com` and
`www.harpapro.com`. Attaching `admin.harpapro.com` to that Pages project changes
the hostname, but it does not create a separate site: the public hosts can still
serve `/admin/activity`.

Admin authentication and data access are already isolated behind the dedicated
`/admin/*` API routes and the separate admin database. This change separates the
web artifact and deployment as well.

## Decision

Create a standalone Astro workspace at `apps/admin` and deploy it to a second
Cloudflare Pages project named `harpa-pro-admin`.

| Surface | Workspace | Pages project | Canonical production URL |
| --- | --- | --- | --- |
| Public website | `apps/site` | `harpa-pro` | `https://harpapro.com` |
| Admin console | `apps/admin` | `harpa-pro-admin` | `https://admin.harpapro.com` |

The public build must contain no admin page, admin component, or admin auth
client. The admin build owns those files and contains no marketing or
documentation pages. This makes it impossible for the normal public-site
deployment to expose the admin shell accidentally.

The API remains in `packages/api`. The admin site continues to use
`/admin/auth/*`, `/admin/activity`, and `/admin/readyz`; the existing independent
admin database and credentials remain unchanged.

## Routes

- `https://admin.harpapro.com/` renders the activity console directly.
- `https://admin.harpapro.com/admin/activity` redirects to `/` for old bookmarks.
- `https://harpapro.com/admin/activity` and
  `https://www.harpapro.com/admin/activity` return the public site's normal 404.
- Every admin document is `noindex`; `robots.txt` disallows the whole admin host.

Rendering the console at `/` avoids a provider-only root redirect and keeps
local, preview, development, and production routing identical.

## Deployments

The admin app has independent preview, development, and production workflows:

- Pull requests deploy `apps/admin/dist` to branch `pr-<number>` of
  `harpa-pro-admin`. The stable browser origin is therefore
  `https://pr-<number>.harpa-pro-admin.pages.dev`.
- Pushes to `dev` deploy branch `dev`, served at
  `https://dev.harpa-pro-admin.pages.dev`.
- Pushes to `main` deploy the Pages production branch and serve
  `https://admin.harpapro.com` after the custom domain is attached.

Admin-only changes must also create the existing per-PR Fly and Neon preview
environment. Its exact `ADMIN_CORS_ORIGINS` value is the stable `pr-<number>`
Pages origin, and the admin preview is built against
`https://harpa-pro-api-pr-<number>.fly.dev`. Using the PR number avoids duplicate
branch-name sanitisation logic across Cloudflare and GitHub Actions.

The development API trusts only
`https://dev.harpa-pro-admin.pages.dev`. Production trusts only
`https://admin.harpapro.com`. The public-site origins are explicitly outside
the admin browser allowlist.

Because development and preview cross from `pages.dev` to `fly.dev`, their
admin session cookie remains `Secure`, `SameSite=None`, and `Partitioned`.
Production uses the same-site `admin.harpapro.com` to `api.harpapro.com` cookie
path and does not require partitioning.

## Implementation boundaries

Move the existing activity island, its unit tests, admin auth client, browser
test, and browser-test configuration into `apps/admin`. Add a minimal admin-only
layout, theme stylesheet, environment parser, Astro configuration, and package
manifest. The admin environment parser requires only `PUBLIC_API_BASE_URL`;
the public site's Turnstile setting is unrelated and must not be copied.

Keep the visual tokens local for this first split. Extracting a shared browser
theme package would add a new coupling point without solving the deployment
boundary. If both surfaces begin changing the same tokens frequently, that can
be evaluated separately.

The public workflows continue to target only `apps/site` and `harpa-pro`. They
must no longer run admin browser tests. New admin workflows target only
`apps/admin` and `harpa-pro-admin`.

## Verification

Automated checks must prove:

1. `apps/site` has no `/admin` source route and its built artifact has no
   `dist/admin` path.
2. `apps/admin` renders the console at `/`, redirects the legacy path, and
   blocks search discovery.
3. Public and admin workflows use different workspace filters, output
   directories, and Pages project names.
4. Unit tests retain activity filtering, refresh markers, text export, sign-in,
   and sign-out behavior after the move.
5. Playwright signs in through `/` against independent local application and
   admin databases.
6. API origin tests accept the exact production, development, and PR-preview
   admin origins while rejecting public-site and lookalike origins.

After deployment, probe the public hosts for a 404, the admin root for a 200,
the legacy admin path for its redirect, and complete one real sign-in/activity
load/sign-out flow on development before production cutover.

## Rollout and rollback

1. Create `harpa-pro-admin` with `main` as its production branch.
2. Merge to `dev`, deploy the stable admin development branch, and verify it
   against the development API.
3. Promote the code to `main` through the normal protected-branch process.
4. Attach `admin.harpapro.com` only to `harpa-pro-admin` and verify the custom
   domain is active.
5. Confirm `admin.harpapro.com` is not attached to `harpa-pro` and that no
   zone-level redirect sends it back to the public project.

Rollback reattaches no admin hostname to the public project. If the new admin
deployment is unhealthy, leave `admin.harpapro.com` detached or roll the
`harpa-pro-admin` project back to its previous deployment while the API remains
unchanged.

