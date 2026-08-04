# Office dashboard deployment (Cloudflare Pages)

This runbook covers the React SPA at `apps/dashboard`. Its dedicated
Cloudflare Pages project name is `harpa-pro-dashboard`.

## Provider status and approval boundary

The pre-cutover provider snapshot on 2026-08-05 shows seven preview
deployments. It shows no production deployment and no custom domain.

The current project uses Direct Upload. Cloudflare does not support converting
that project to Git integration. Cloudflare requires a new Git-integrated
project, as stated in its
[Direct Upload documentation](https://developers.cloudflare.com/pages/get-started/direct-upload/).

Deleting or replacing the current project is an external destructive action.
It also removes the seven preview deployment records and their URLs. An
operator must approve that exact action before the provider cutover.

Until that approval and recreation finish:

- do not claim that dashboard Git deployment is active;
- do not claim that a dashboard production deployment exists;
- do not claim that `app.harpapro.com` is attached to Pages; and
- treat dashboard verification timeouts as a provider setup gap.

The minimal cutover recreates the Git-integrated project with the same
`harpa-pro-dashboard` name. If Cloudflare cannot preserve that name, stop.
A new hostname also changes API CORS, tests, workflows, and documentation.

## Target deployment topology

The following table is the post-cutover contract. It does not describe the
current external project before recreation.

| Git source | Pages origin                           | API target                     |
| ---------- | -------------------------------------- | ------------------------------ |
| `pr-<n>`   | `pr-<n>.harpa-pro-dashboard.pages.dev` | `harpa-pro-api-pr-<n>.fly.dev` |
| `dev`      | `dev.harpa-pro-dashboard.pages.dev`    | `harpa-pro-api-dev.fly.dev`    |
| `main`     | `harpa-pro-dashboard.pages.dev`        | `api.harpapro.com`             |

`app.harpapro.com` is a later production custom-domain target. It is not part
of the current preview-only provider state.

Cloudflare Git publishes each static artifact. GitHub Actions tests the source
and verifies the deployed artifact. GitHub Actions does not upload the
dashboard or hold Cloudflare credentials.

## Project recreation

After explicit approval, configure the replacement project as follows:

1. Connect `patrickchin/harpa-pro` through Cloudflare Pages Git integration.
2. Keep the project name `harpa-pro-dashboard`.
3. Set the repository root as the build root.
4. Set the build command to
   `bash scripts/ci/build-cloudflare-pages.sh dashboard`.
5. Set the output directory to `apps/dashboard/dist`.
6. Set `main` as the production branch.
7. Restrict preview builds to `dev` and `pr-*` branches.
8. Keep production builds disabled until production activation is approved.

Build watch paths must include `apps/dashboard`, its workspace dependencies,
the root workspace files, and `scripts/ci/build-cloudflare-pages.sh`.

## Cloudflare build environment

The build wrapper derives the API target from `CF_PAGES_BRANCH` and exports it
as `VITE_API_BASE_URL`:

| Branch   | `VITE_API_BASE_URL`                    |
| -------- | -------------------------------------- |
| `pr-<n>` | `https://harpa-pro-api-pr-<n>.fly.dev` |
| `dev`    | `https://harpa-pro-api-dev.fly.dev`    |
| `main`   | `https://api.harpapro.com`             |

Configure these dashboard values in Cloudflare Pages:

- `VITE_PASSWORD_ACCOUNT_EMAILS`: preview-only, comma-separated public test
  account email addresses;
- `VITE_SENTRY_DSN`: optional public browser DSN.

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

Do not enable dashboard production builds during the preview-only cutover.
Production activation requires a separate approval after `apps/dashboard`
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

The current external project has no production deployment to roll back. A
failed preview cutover rolls forward through a corrected `pr-<n>` commit or
pauses Git builds while the provider configuration is fixed.

After production activation, use the Cloudflare Pages production rollback
control for a bad static artifact. Then verify the exact selected artifact,
SPA routing, sign-in, and one report against the compatible API.
