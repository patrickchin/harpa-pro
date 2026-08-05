# Office dashboard deployment (Cloudflare Pages)

This runbook covers the React SPA at `apps/dashboard`. Its dedicated
Cloudflare Pages project name is `harpa-pro-dashboard`.

## Verified provider state

On 2026-08-05, the Cloudflare UI connected the existing Direct Upload project
to `patrickchin/harpa-pro` in place. Cloudflare preserved all seven existing
preview deployments. No project deletion or recreation occurred.

The project has no production deployment or custom domain. Its production
branch is `main`, but automatic production deployments remain disabled.
The initial connection limited previews to `pr-211`. After dev activation, the
custom preview branches are `dev` and `pr-*`; production remains disabled.

## Target deployment topology

The following table describes the Git deployment contract. The `main` row
remains inactive while automatic production deployments are disabled.

| Git source | Pages origin                           | API target                     |
| ---------- | -------------------------------------- | ------------------------------ |
| `pr-<n>`   | `pr-<n>.harpa-pro-dashboard.pages.dev` | `harpa-pro-api-pr-<n>.fly.dev` |
| `dev`      | `dev.harpa-pro-dashboard.pages.dev`    | `harpa-pro-api-dev.fly.dev`    |
| `main`     | `harpa-pro-dashboard.pages.dev`        | `api.harpapro.com`             |

`app.harpapro.com` is a later production custom-domain target. It is not part
of the current provider state.

Cloudflare Git publishes each static artifact. GitHub Actions tests the source
and verifies the deployed artifact. GitHub Actions does not upload the
dashboard or hold Cloudflare credentials.

## Pages Git configuration

The verified project configuration is:

1. Git repository: `patrickchin/harpa-pro`.
2. Build command: `pnpm install --frozen-lockfile`, followed by
   `bash scripts/ci/build-cloudflare-pages.sh dashboard`.
3. Output directory: `apps/dashboard/dist`.
4. Production branch: `main`.
5. Automatic production deployments: disabled.
6. Preview branch mode: custom branches.
7. Preview custom branches: `dev` and `pr-*`.
8. Build watch include: `*`.

The draft rollout initially allowed only `pr-211`; that temporary restriction
ended after the application landed on `dev`. Every allowed branch commit must
produce the exact-SHA marker expected by the verification workflow.

## Public-site dashboard entry

The shared public-site header shows `Dashboard` as its final desktop and mobile
action. `PUBLIC_DASHBOARD_URL` is required by the site environment. The Pages
build wrapper derives its value from the site branch:

| Site branch | `PUBLIC_DASHBOARD_URL`                         |
| ----------- | ---------------------------------------------- |
| `pr-<n>`    | `https://pr-<n>.harpa-pro-dashboard.pages.dev` |
| `dev`       | `https://dev.harpa-pro-dashboard.pages.dev`    |
| `main`      | `https://harpa-pro-dashboard.pages.dev`        |

The link opens in the same tab. The `main` value defines the future production
contract, but automatic dashboard production builds remain disabled.

## Cloudflare build environment

The build wrapper derives the API target from `CF_PAGES_BRANCH` and exports it
as `VITE_API_BASE_URL`:

| Branch   | `VITE_API_BASE_URL`                    |
| -------- | -------------------------------------- |
| `pr-<n>` | `https://harpa-pro-api-pr-<n>.fly.dev` |
| `dev`    | `https://harpa-pro-api-dev.fly.dev`    |
| `main`   | `https://api.harpapro.com`             |

Configure these dashboard values in Cloudflare Pages:

- `SKIP_DEPENDENCY_INSTALL=1`: required so Pages does not interpret the
  repository-root Fastlane `Gemfile.lock` as a dashboard dependency; the
  explicit build command installs the pnpm workspace with the frozen lockfile;
- `VITE_PASSWORD_ACCOUNT_EMAILS`: required, comma-separated public test
  account email addresses. Set it in both the Preview and Production variable
  scopes;
- `VITE_SENTRY_DSN`: optional public browser DSN.

The build wrapper fails every native dashboard build when
`VITE_PASSWORD_ACCOUNT_EMAILS` is missing or empty. The Production value stays
dormant while automatic production builds are disabled.

The build wrapper sets `VITE_SENTRY_RELEASE` from
`CF_PAGES_COMMIT_SHA`. It sets the default Sentry environment from the branch.
The dashboard does not initialize Sentry when `VITE_SENTRY_DSN` is empty.

The password-account emails are public browser configuration. The password is
not. The live test loads `TEST_ACCOUNT_PASSWORD` from Doppler after deployment
and keeps it out of the Pages artifact.

Do not add `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` to a dashboard
workflow. The Git integration owns publication.

## Pull request ref and SHA contract

`pages-preview-ref.yml` owns the preview branch lifecycle for human-owned,
same-repository pull requests:

1. It creates or updates `refs/heads/pr-<n>` to the pull request head SHA.
2. It never checks out pull request code while holding `contents: write`.
3. It deletes only that generated ref when the pull request closes.

Cloudflare builds the generated branch. The build writes
`_cf-pages-deployment.json` with `CF_PAGES_COMMIT_SHA` and `CF_PAGES_BRANCH`.

`dashboard-preview.yml` polls the stable `pr-<n>` Pages origin until the
marker contains the pull request head SHA and branch. A stale `200` response
does not pass this gate.

The API and browser checks have distinct SHA contracts:

- the Fly preview must report GitHub's tested synthetic merge SHA; and
- the Pages marker must report the pull request head SHA from `pr-<n>`.

After both checks pass, the workflow verifies SPA routing and runs the live
Chromium journey against the stable `pr-<n>` alias. It does not depend on a
deployment-specific URL.

## Browser authentication and CORS

The API must echo a validated dashboard origin and allow credentials. Never
use `Access-Control-Allow-Origin: *` for authenticated requests.

The dashboard origin allowlist covers:

- `http://localhost:3003` and `http://127.0.0.1:3003`;
- `https://harpa-pro-dashboard.pages.dev`;
- `https://dev.harpa-pro-dashboard.pages.dev`;
- the validated `*.harpa-pro-dashboard.pages.dev` preview hostname boundary;
  and
- `https://app.harpapro.com` only after custom-domain activation.

The same origin set must satisfy Better Auth and the dashboard CORS policy.
The API integration suite owns positive and negative origin cases.

Pages previews are public by default. Dashboard data remains behind Harpa Pro
authentication. Do not enable Cloudflare Access until the verifier has a
service-token path.

## SPA routing contract

The dashboard artifact must contain `index.html` and no top-level `404.html`.
Cloudflare then serves the SPA entry document for client-side routes.

After exact-SHA verification, `scripts/ci/verify-dashboard-pages.sh` checks
both `/` and `/projects/spa-routing-smoke`. Both routes must return `200` with
the same HTML body.

## Dev and production activation

The tokenless workflows verify stable aliases. They do not publish artifacts.

- `dashboard-dev.yml` checks API compatibility, verifies the exact `dev` SHA,
  and checks SPA routing on `dev.harpa-pro-dashboard.pages.dev`.
- `dashboard-prod.yml` checks API compatibility and verifies the exact `main`
  SHA on each configured production hostname.

Do not enable dashboard production builds during the current dev activation.
Production activation requires separate approval after `apps/dashboard`
reaches `main` and the production API compatibility gate passes.

Do not create only a DNS record for `app.harpapro.com`. A later production
cutover must attach it through the Pages custom-domain flow and wait for an
active TLS certificate. A CNAME alone does not prove that Pages owns the
hostname.

## Local checks

Run the dashboard checks without a Cloudflare credential:

```bash
VITE_API_BASE_URL=http://localhost:8787 \
  pnpm --filter @harpa/dashboard test
VITE_API_BASE_URL=http://localhost:8787 \
  pnpm --filter @harpa/dashboard lint
VITE_API_BASE_URL=http://localhost:8787 \
  pnpm --filter @harpa/dashboard typecheck
CF_PAGES_BRANCH=pr-42 \
CF_PAGES_COMMIT_SHA=0123456789abcdef0123456789abcdef01234567 \
VITE_PASSWORD_ACCOUNT_EMAILS=test-owner@example.com,test-editor@example.com \
  bash scripts/ci/build-cloudflare-pages.sh dashboard
bash scripts/ci/__tests__/cloudflare-pages-build.test.sh
bash scripts/ci/__tests__/cloudflare-pages-git-policy.test.sh
bash scripts/ci/__tests__/dashboard-pages-policy.test.sh
bash scripts/ci/__tests__/dashboard-live-e2e-policy.test.sh
bash scripts/ci/__tests__/verify-dashboard-pages.test.sh
```

## Rollback

The current project has no production deployment to roll back. Fix a failed
preview through a corrected `pr-<n>` commit, or pause Git builds while the
provider configuration is fixed.

After production activation, use the Cloudflare Pages production rollback
control for a bad static artifact. Then verify the exact selected artifact,
SPA routing, sign-in, and one report against the compatible API.
