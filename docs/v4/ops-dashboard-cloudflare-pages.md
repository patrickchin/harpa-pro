# Office dashboard deployment (Cloudflare Pages)

This runbook covers the React SPA at `apps/dashboard`. It deploys to the
dedicated Cloudflare Pages project `harpa-pro-dashboard`; it never uploads to
the public site's `harpa-pro` project.

## Deployment topology

| Source                          | Workflow                | Pages target                                           | API target                  |
| ------------------------------- | ----------------------- | ------------------------------------------------------ | --------------------------- |
| Pull request to `dev` or `main` | `dashboard-preview.yml` | `pr-<n>` preview branch                                | Matching isolated PR API    |
| Push to `dev`                   | `dashboard-dev.yml`     | `dev.harpa-pro-dashboard.pages.dev`                    | `harpa-pro-api-dev.fly.dev` |
| Push to `main`                  | `dashboard-prod.yml`    | `app.harpapro.com` and `harpa-pro-dashboard.pages.dev` | `api.harpapro.com`          |

Each pull request deployment has two URLs:

- an immutable, hash-addressed URL for that exact Cloudflare deployment;
- `pr-<n>.harpa-pro-dashboard.pages.dev`, an alias that advances to the latest
  push for that pull request.

`dashboard-preview.yml` puts both URLs, the selected API URL, GitHub's tested
synthetic merge SHA, and the pull request head SHA in one `dashboard-preview`
sticky comment. Cloudflare documents the immutable and branch-alias distinction
in its
[preview deployment guide](https://developers.cloudflare.com/pages/configuration/preview-deployments/).

The preview workflow runs for dashboard inputs and API inputs. Every run uses
`https://harpa-pro-api-pr-<n>.fly.dev`. The shared changed-path action makes a
dashboard-only change provision matching application/admin Neon branches and a
Fly API, so live browser journeys can create and clean up data without mutating
the shared dev environment. The Fly release command migrates both branches and
idempotently seeds any configured test/demo password accounts before the
dashboard journey starts.

Before any Pages upload, `scripts/ci/verify-api-release.sh` proves the selected
API is ready and compatible with the checked-out commit. The dev and production
workflows use the same gate, so an API contract change cannot publish the
dashboard ahead of its matching API rollout.

## Project bootstrap

The first preview does not depend on a manual project-creation step.
`scripts/ci/ensure-dashboard-pages-project.sh` uses the Cloudflare API to read
or create `harpa-pro-dashboard` and repairs its production branch to `main`.
Every dashboard workflow runs it immediately before the Pages upload. The
operation is idempotent and verifies the end state if two first deployments
race.

To pre-create the project for an operator check, authenticate Wrangler as a
Cloudflare account member and run:

```bash
pnpm exec wrangler pages project create harpa-pro-dashboard \
  --production-branch=main
```

Whether CI or an operator creates it, confirm it is separate from the public
site:

```bash
pnpm exec wrangler pages project list
```

There must be two project rows:

- `harpa-pro` for `apps/site`;
- `harpa-pro-dashboard` for `apps/dashboard`.

Cloudflare's
[Direct Upload documentation](https://developers.cloudflare.com/pages/get-started/direct-upload/)
describes the project and branch model used by these workflows.

The automated bootstrap and deployments use the GitHub Actions secrets already
configured for the public site:

- `CLOUDFLARE_ACCOUNT_ID`;
- `CLOUDFLARE_API_TOKEN`, scoped to Account → Cloudflare Pages → Edit.
- `SENTRY_DASHBOARD_DSN`, optional; when present, the build enables
  privacy-safe dashboard error and performance telemetry.

The token may be reused because it is account-scoped. No dashboard API URL is a
secret. Vite inlines `VITE_API_BASE_URL` into the uploaded bundle, so every
workflow sets it on the build itself. Preview builds also inline
`VITE_PASSWORD_ACCOUNT_EMAILS`, a comma-separated list of public automation
identities from repository variables; the password remains server-side and in
the live-test process only. Setting either value in the Pages dashboard does not
change a pre-built `dist` upload.

## Production hostname

Do not create only a DNS record. In Workers & Pages:

1. Open `harpa-pro-dashboard`.
2. Open **Custom domains** and select **Set up a domain**.
3. Add `app.harpapro.com`.
4. Replace the existing parked/redirect record only as part of this setup.
5. Wait for the Pages custom domain and TLS certificate to become active.

Because `harpapro.com` is already a Cloudflare zone, Cloudflare should create or
replace the proxied CNAME during the custom-domain flow. Manually pointing a
CNAME at Pages without associating the hostname with the project can return
`522`; follow Cloudflare's
[custom-domain procedure](https://developers.cloudflare.com/pages/configuration/custom-domains/).

Verify before merging the first dashboard change to `main`:

```bash
curl -I https://app.harpapro.com/
DASHBOARD_URL=https://app.harpapro.com \
  bash scripts/ci/verify-dashboard-pages.sh
```

## Browser auth and CORS setup

The API must validate and echo allowed dashboard origins while allowing
credentials. Do not use `Access-Control-Allow-Origin: *` for authenticated
requests.

The browser-auth/CORS allowlist must cover:

- `http://localhost:3003` and `http://127.0.0.1:3003` for local Vite and
  Playwright development;
- `https://app.harpapro.com`;
- `https://harpa-pro-dashboard.pages.dev`;
- `https://dev.harpa-pro-dashboard.pages.dev`;
- the narrowly validated `*.harpa-pro-dashboard.pages.dev` preview hostname
  pattern, including immutable hashes and `pr-<n>` aliases.

The Pages hostname pattern must be validated as a hostname boundary, not with a
substring check and never as a general `*.pages.dev` wildcard. The same origin
set must be accepted by better-auth and the dedicated dashboard CORS policy.
The API integration suite owns positive and negative origin cases.

Pages previews are public by default, while dashboard data remains behind Harpa
Pro authentication. Do not enable Cloudflare Access for previews until the
post-deploy verifier has a service-token path; Access would otherwise turn its
anonymous deep-route request into a failure. If Access is added, follow
Cloudflare's
[preview Access guidance](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
and keep application authentication in place.

## SPA routing contract

Cloudflare Pages treats a deployment without a top-level `404.html` as a
single-page application and serves `/index.html` for unmatched navigation
paths. See Cloudflare's
[Pages serving behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/).

Every dashboard workflow therefore:

1. asserts that `apps/dashboard/dist/index.html` exists;
2. rejects `apps/dashboard/dist/404.html`;
3. deploys the static directory;
4. requests both `/` and `/projects/spa-routing-smoke`;
5. requires both responses to be `200` with the same HTML body.

`scripts/ci/verify-dashboard-pages.sh` owns the deployed check, and
`scripts/ci/__tests__/verify-dashboard-pages.test.sh` covers the successful SPA,
deployment propagation, deep-link `404`, and wrong-document cases with a fake
HTTP server. The verifier allows up to 18 attempts at five-second intervals so
transient `522` responses during a new Pages deployment do not create a false
negative.

## Local and diagnostic commands

Run the same dashboard checks as preview CI:

```bash
VITE_API_BASE_URL=http://localhost:8787 \
  pnpm --filter @harpa/dashboard test
VITE_API_BASE_URL=http://localhost:8787 \
  pnpm --filter @harpa/dashboard lint
VITE_API_BASE_URL=http://localhost:8787 \
  pnpm --filter @harpa/dashboard typecheck
VITE_API_BASE_URL=http://localhost:8787 \
  pnpm --filter @harpa/dashboard build
pnpm --filter @harpa/dashboard exec playwright install chromium firefox webkit msedge
pnpm --filter @harpa/dashboard test:e2e
bash scripts/ci/__tests__/dashboard-pages-policy.test.sh
bash scripts/ci/__tests__/verify-dashboard-pages.test.sh
```

CI is the deployment source of truth. For a manual preview diagnostic after the
build:

```bash
pnpm exec wrangler pages deploy apps/dashboard/dist \
  --project-name=harpa-pro-dashboard \
  --branch=diagnostic
```

Then run:

```bash
DASHBOARD_URL=https://diagnostic.harpa-pro-dashboard.pages.dev \
  bash scripts/ci/verify-dashboard-pages.sh
```

## Rollback

For a production frontend regression:

1. Open `harpa-pro-dashboard` → **Deployments**.
2. Select a known-good production deployment.
3. Choose **Rollback to this deployment** and confirm.
4. Run the SPA verifier against `https://app.harpapro.com`.
5. Confirm sign-in, project load, and one report load against the current API.
6. Revert or fix the source commit so the next `main` deployment preserves the
   rollback.

Cloudflare allows rollback to successful production deployments, not preview
deployments. See its
[Pages rollback guide](https://developers.cloudflare.com/pages/configuration/rollbacks/).
Do not roll the dashboard across a breaking API boundary; coordinate the API
rollback or forward fix first.

For dev, revert or fix on `dev` and let `dashboard-dev.yml` replace the branch
alias. For a pull request preview, push a correction; the sticky comment keeps
the prior immutable URL and updates to the new deployment.
