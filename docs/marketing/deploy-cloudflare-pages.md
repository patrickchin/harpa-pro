# Public site deploy notes (Cloudflare Pages)

This runbook covers the Astro app at `apps/site`, including the marketing,
roadmap, legal, and `/reports/docs` routes. All routes deploy as one static output to
the Cloudflare Pages project `harpa-pro`.

## Why Cloudflare Pages

`harpapro.com` already uses Cloudflare Registrar and DNS. A static Astro build
does not need the Cloudflare SSR adapter. The Git-connected Pages project
builds `apps/site/dist` from `main`, `dev`, and generated `pr-N` branches. The
same project supplies pull request previews, the stable `dev` deployment, and
production without a Cloudflare credential in GitHub Actions.

## Project and workflow topology

| Source                                                      | Publisher and verifier                      | Cloudflare target                                |
| ----------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| Human-owned same-repository pull request to `dev` or `main` | Cloudflare Git; `site-preview.yml` verifies | `pr-N.harpa-pro.pages.dev`                       |
| Push to `dev`                                               | Cloudflare Git; `site-dev.yml` verifies     | `dev.harpa-pro.pages.dev`                        |
| Push to `main`                                              | Cloudflare Git; `site-prod.yml` verifies    | `harpapro.com`, `www`, and `harpa-pro.pages.dev` |

The Pages project name stays `harpa-pro`; renaming the repository app does not
rename the Cloudflare project.

## Cloudflare project setup

1. Open **Workers & Pages** in the Cloudflare dashboard.
2. Confirm the canonical `harpa-pro` Pages project is Git-integrated with
   `patrickchin/harpa-pro` through the GitHub App. A Direct Upload project
   cannot be converted in place; create a replacement Git-integrated project
   if recovery ever finds the canonical project in that state.
3. Set `main` as production. Restrict previews to `dev` and `pr-*`.
4. Set the build command to install the pinned workspace dependencies and run
   `scripts/ci/build-cloudflare-pages.sh site`; output is `apps/site/dist`.
5. Leave the build watch include at its default `*` and configure no excludes.
   GitHub verification may run for deployment-infrastructure changes outside
   the app directory, so every managed branch commit must produce a fresh
   exact-SHA deployment marker.
6. Store `PUBLIC_TURNSTILE_SITE_KEY` as a plain-text production and preview
   build variable. It is a browser-visible site key, not a server secret.
7. Attach `harpapro.com` and `www.harpapro.com` as production custom domains.

Astro inlines `PUBLIC_API_BASE_URL` and `PUBLIC_TURNSTILE_SITE_KEY` during the
build. `build-cloudflare-pages.sh` selects the API from `CF_PAGES_BRANCH`; the
credential-free verification job uses Cloudflare's checked-in public test key
so fork and Dependabot builds run without secrets. Native Pages builds use the
real public site key from the Cloudflare build environment.

`pages-preview-ref.yml` mirrors an eligible pull request head to the generated
Git branch `pr-N` without checking out pull request code under its scoped
`contents: write` permission. Closing the pull request deletes that exact ref.
Cloudflare credentials are not stored in GitHub.

## Local commands

```bash
pnpm --filter @harpa/site test
pnpm --filter @harpa/site lint
pnpm --filter @harpa/site typecheck
PUBLIC_API_BASE_URL=http://localhost:8787 \
PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA \
  pnpm --filter @harpa/site build
pnpm --filter @harpa/site test:e2e
```

Git is the deployment source of truth. For a manual diagnostic rebuild, retry
the selected Git deployment in the Cloudflare dashboard. Do not restore a
credentialed Wrangler workflow or a long-lived GitHub API token.

## URL migration release order

The reporting app and its resources now use `/reports`; procurement keeps
`/` and `/procurement/how-to-buy-from-china`. Privacy remains shared at
`/privacy`. The site ships permanent redirects from old URLs, including
`/app` and `/confirm`, and emits file-format HTML for extensionless canonicals.

Deploy and verify the website routes before rolling out the API's new default
confirmation URL. If `WAITLIST_CONFIRM_BASE_URL` is explicitly configured in
Doppler or Fly, update its path to `/reports/confirm` for that environment;
changing the schema default does not override configured values. Existing
confirmation emails remain valid through the `/confirm` redirect, which
preserves tokens. No auth or dashboard hostname changes are needed.

Run `pnpm --filter @harpa/site test:redirects` after building to exercise the
actual Pages redirect rules locally. The static Lighthouse inputs use
`reports.html` and `reports/docs.html`; public links use extensionless URLs.

## Documentation deployment verification

The app guides are part of this same static deployment at
`https://harpapro.com/reports/docs`. A separate documentation site, hostname,
DNS change, or hosting cutover is not required.

Before merging, verify the PR preview and its required checks. After merging
into `dev`, verify `/reports/docs` and representative guides on the dev
origin. Production uses the same paths after the normal protected promotion
to `main`.

Check the sitemap, canonical metadata, an unknown guide's branded 404, and
the old path redirects listed in `apps/site/public/_redirects`. Redirects
preserve query strings, including existing confirmation tokens. Roll back a
site regression through the normal Git deployment process.
