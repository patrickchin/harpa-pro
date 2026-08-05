# Observability and operations

## Hosting

- **API**: Fly.io:
  - `harpa-pro-api` (prod) at `https://api.harpapro.com` — deployed on
    push to `main` by `.github/workflows/api-prod.yml`. Temporarily
    sleeps when idle (`min_machines_running = 0`) until production
    traffic needs the warm HA floor again.
  - `harpa-pro-api-dev` (dev) at `https://harpa-pro-api-dev.fly.dev` —
    deployed on push to `dev` by `.github/workflows/api-dev.yml`.
    Sleeps when idle (`min_machines_running = 0`) to save cost.
  - `harpa-pro-api-pr-<n>` (per-PR preview) at
    `https://harpa-pro-api-pr-<n>.fly.dev` — created by
    `.github/workflows/pr-preview.yml` (job `fly-preview`) when the PR
    changes API inputs, the admin browser app, or the office dashboard,
    destroyed on PR
    close (job `fly-destroy`). Config:
    [`infra/fly/fly.preview.toml`](../../infra/fly/fly.preview.toml).
    Single shared-cpu-1x machine, `min_machines_running = 0`,
    `auto_stop_machines = "stop"`. Forks skipped (no `FLY_API_TOKEN`).
    The preview's `DATABASE_URL` points at the matching Neon `pr-<n>`
    branch. Admin and dashboard previews use the matching Fly app so browser
    auth and live journeys never mutate the shared dev database. Mobile
    dev/preview builds can flip to a preview URL via `setApiBaseUrlOverride`.
- **Databases**: two independent Neon projects:
  - the application project uses long-lived `main` (production) and `dev`
    branches plus per-PR `pr-<n>` branches; and
  - `harpa-pro-admin` uses database `harpa_admin`, with matching `main`,
    long-lived `dev`, and matching per-PR `pr-<n>` branches for API, admin,
    and dashboard previews.
    The separate projects give application and admin credentials independent
    restore timelines. See [arch-database.md](arch-database.md).
- **Storage**: Cloudflare R2. Separate buckets per env
  (`harpa-pro` / `harpa-pro-dev`). See [arch-storage.md](arch-storage.md).
- **Public site**: Astro app `apps/site` on Cloudflare Pages project
  `harpa-pro`. One static deployment serves marketing, roadmap, legal, and
  product guides at `https://harpapro.com/docs`.
  - Production branch `main` → `https://harpapro.com` (and
    `harpa-pro.pages.dev`).
  - Dev branch `dev` → `https://dev.harpa-pro.pages.dev`.
  - The public artifact contains no admin route or admin-auth client.
  - After cutover, the standalone hostname `docs.harpapro.com` redirects to
    the canonical `/docs` routes through Cloudflare zone rules. See
    [the Cloudflare Pages runbook](../marketing/deploy-cloudflare-pages.md).
- **Admin site**: Astro app `apps/admin` on the independent Cloudflare Pages
  project `harpa-pro-admin`.
  - Production branch `main` → `https://admin.harpapro.com` (and
    `harpa-pro-admin.pages.dev`).
  - Dev branch `dev` → `https://dev.harpa-pro-admin.pages.dev`.
  - PR branch `pr-<n>` →
    `https://pr-<n>.harpa-pro-admin.pages.dev`, built against the matching
    `harpa-pro-api-pr-<n>` Fly app.
  - `/` renders the activity console and `/operations` renders read-only service
    monitoring; unknown browser paths return a static 404. `/admin/activity`
    remains an API resource path. Data requests require the dedicated API admin
    session. See [Separate admin site](design-separate-admin-site.md).
- **Static web runtime**: `apps/site` and `apps/admin` use Astro 7 with Vite 8
  and require Node 22.12.0 or newer. Shared CI currently uses the Node 22
  channel. Node 24 standardization is tracked separately.
- **Office dashboard**: React SPA `apps/dashboard` on the separate Cloudflare
  Pages project `harpa-pro-dashboard`.
  - React 19 builds with Vite 8 and Tailwind CSS 4. Vite 8 shares the static
    web runtime's Node 22.12.0 minimum.
  - Target production branch `main` → `harpa-pro-dashboard.pages.dev` against
    the production API. `app.harpapro.com` is not yet attached.
  - Dev branch `dev` → `dev.harpa-pro-dashboard.pages.dev` against the dev API.
  - Pull request branch `pr-<n>` → the stable
    `pr-<n>.harpa-pro-dashboard.pages.dev` alias against its matching isolated
    Fly/Neon preview.
  - GitHub verifies the alias serves the pull request head SHA before SPA and
    live browser checks.
  - On 2026-08-05, Cloudflare connected the existing Direct Upload project to
    `patrickchin/harpa-pro` in place and preserved all seven preview
    deployments. Automatic production deployments remain disabled. No custom
    domain is attached. See
    [the dashboard Pages runbook](ops-dashboard-cloudflare-pages.md).
- **Mobile**: Fastlane + EAS. Fastlane owns checked-in App Store /
  Play Store metadata, guarded screenshot/privacy lanes, and local
  release orchestration; EAS owns Expo native builds, signing, binary
  submission, and OTA updates. Internal QA uses the preview/dev
  bundle/package (`com.harpa.pro.dev`) against the dev backend. The
  production bundle/package (`com.harpa.pro`) points at production and is
  reserved for App Review, final smoke checks, and public rollout. Three
  build profiles live in
  `apps/mobile/eas.json`:
  - `production` — App Store / Play. `com.harpa.pro` →
    `https://api.harpapro.com`.
  - `preview` — internal dev QA. `com.harpa.pro.dev` →
    `https://harpa-pro-api-dev.fly.dev`. Installable side-by-side
    with prod so QA can carry both apps.
  - `development` — Metro dev-client. `com.harpa.pro.dev` →
    `http://localhost:8787`.
    Non-prod variants expose a runtime API base-URL override
    (`setApiBaseUrlOverride` in `lib/api/base-url.ts`) so QA can flip
    between dev / a PR-preview Fly app without a rebuild. Override is
    hard-disabled in production builds.
    Release operators run Fastlane from the repo root:

  ```sh
  gem install bundler -v 2.6.9 --no-document
  bundle _2.6.9_ config set --local path vendor/bundle
  bundle _2.6.9_ install
  bundle exec fastlane doctor
  bundle exec fastlane screenshots_preview       # only after assets exist
  bundle exec fastlane app_privacy_preview       # only after review
  bundle exec fastlane beta                      # internal QA on dev backend
  bundle exec fastlane screenshots_production    # only after assets exist
  bundle exec fastlane app_privacy_production    # only after review
  bundle exec fastlane beta_production           # final smoke on production backend
  bundle exec fastlane release
  ```

  `doctor` is safe: it validates Bundler/Fastlane, `pnpm`, EAS config,
  and metadata files, then prints the EAS commands without uploading
  metadata, screenshots, privacy answers, starting a build, or
  submitting a binary. `beta` pushes preview/internal store metadata,
  then starts the `preview` EAS build with
  `--auto-submit-with-profile preview` so EAS submits the dev-backend
  binaries produced by that build. `beta_production` pushes production
  metadata, builds the `production` profile, and auto-submits the
  resulting `com.harpa.pro` binaries to TestFlight and the Play internal
  track through the `production-internal` EAS submit profile for final
  smoke only. `release` builds and submits production binaries to the
  public store release targets.
  Store, Expo, Apple, and Google credentials stay outside git and come
  from authenticated local tools or environment variables. The first
  Play metadata upload may require an existing release on the target
  track; if `supply` reports an empty track, run the EAS submit lane
  once for that track and re-run the metadata lane. Local release tooling
  follows [`.ruby-version`](../../.ruby-version) (`3.4.10` today) and
  Bundler `2.6.9`; the Gemfile stays compatible with the Ruby 3.2 runtime
  on Expo's SDK 55 builders.

## Mobile store launch workflow

Store launch is a two-layer workflow:

- **Repo-owned and reviewable:** textual metadata, iOS category, optional
  iOS age-rating JSON, optional App Store privacy JSON, and screenshot
  upload lanes.
- **Console-owned and owner-reviewed:** App Store Connect app records,
  Play Console app records, app availability/pricing, TestFlight groups,
  Play tester lists, Play content rating, Play data safety, target
  audience, and final submit/release buttons.

The repo intentionally does not contain store credentials. Local
operators use existing EAS auth, App Store Connect auth, and Google Play
auth. Private key files belong outside the repo or under the gitignored
`fastlane/credentials/` path.

### Store records

Create and keep these store records aligned with
`apps/mobile/eas.json`:

| Target     | iOS bundle id / ASC app id         | Android package     | Store role                                           |
| ---------- | ---------------------------------- | ------------------- | ---------------------------------------------------- |
| Preview    | `com.harpa.pro.dev` / `6776967689` | `com.harpa.pro.dev` | TestFlight + Play internal QA on dev backend         |
| Production | `com.harpa.pro` / `6776759817`     | `com.harpa.pro`     | App Review, final smoke, App Store + Play production |

This is intentionally a two-environment split for now. A future staging
environment should add a third store/backend target for production-like QA
without touching production data.

iOS metadata lanes set the primary category to `Business` and secondary
category to `Productivity`. Operators still verify category display in
App Store Connect before review submission. Play Console category remains
manual and should be set to `Business` unless product positioning changes.

### Compliance setup

Use the shipping app and the hosted privacy policy at
`https://harpapro.com/privacy` as the source of truth. As of this setup,
the app has account/auth data, project/report/note content, uploaded
photos/documents, voice/audio recordings, Sentry diagnostics, and usage
counters for app functionality and reliability. The app does not wire
ads, IDFA/ATT tracking, contacts, health, fitness, precise location, or
media-location extraction. The mobile app exposes the same hosted policy from
Profile -> Privacy Policy; keep that in-app link, App Store Connect, Play
Console, and `apps/mobile/fastlane/metadata/ios/en-US/privacy_url.txt`
aligned.

App Store:

- Answer App Privacy in App Store Connect once with an Apple ID that has
  owner/admin rights. Fastlane's App Store privacy action cannot use an
  App Store Connect API key.
- Save the reviewed JSON to
  `apps/mobile/fastlane/app_store/app_privacy_details.json`, then run
  `bundle exec fastlane app_privacy_preview` or
  `bundle exec fastlane app_privacy_production`.
- If the account owner chooses to automate age rating, copy Fastlane's
  `app_rating_config_path` template to
  `apps/mobile/fastlane/app_store/age_rating.json`. When that file
  exists, `metadata_preview` / `metadata_production` validate and upload
  it with the rest of iOS metadata.

Play Store:

- Complete Content rating, Target audience and content, Ads, App access,
  and Data safety in Play Console. Fastlane `supply` uploads metadata,
  images, screenshots, and binaries, but these questionnaire flows remain
  console-owned.
- Keep the Play privacy-policy URL set to `https://harpapro.com/privacy`.
- Keep the Play Data safety account-deletion URL set to
  `https://harpapro.com/account-deletion`.
- Enable Play App Signing before the first production release.

### Screenshot setup

Store screenshots are captured from real v4 builds with production-like
sample data. Do not use fixture-only strings, private customer content,
real emails, phone numbers, secrets, or test-only banners.

Required repo layout is documented in
`apps/mobile/fastlane/metadata/README.md`. iOS screenshots live under
`apps/mobile/fastlane/screenshots/en-US/`; Play screenshots live
under `apps/mobile/fastlane/metadata/android/en-US/images/` using the
Fastlane `supply` screenshot folders.

iOS is intentionally phone-only for the initial review build
(`ios.supportsTablet = false`) because the checked-in screenshot set covers the
6.9-inch iPhone family only. Re-enable iPad support only after reviewed iPad
screenshots exist for every submitted locale.

After assets are reviewed:

```sh
bundle exec fastlane screenshots_preview
bundle exec fastlane screenshots_production
```

These lanes replace screenshots on the target stores. Run them only when
the local screenshot set is complete for the locale/device family being
updated.

### Internal testing

Internal QA uses the dev app identifiers and dev backend. Use this path
for repeated tester churn, fixture-heavy flows, screenshots, and any test
that might create noisy or disposable data.

Internal QA flow:

```sh
gem install bundler -v 2.6.9 --no-document
bundle _2.6.9_ config set --local path vendor/bundle
bundle _2.6.9_ install
FASTLANE_SKIP_UPDATE_CHECK=1 bundle exec fastlane doctor
FASTLANE_SKIP_UPDATE_CHECK=1 bundle exec fastlane metadata_preview
FASTLANE_SKIP_UPDATE_CHECK=1 bundle exec fastlane beta
```

`metadata_preview` pushes checked-in text metadata to the
`com.harpa.pro.dev` store records. `beta` repeats metadata upload, starts
the EAS `preview` build for both platforms, and auto-submits the created
binaries with the EAS `preview` submit profile: App Store
Connect/TestFlight app `6776967689` and Play internal track for package
`com.harpa.pro.dev`.

TestFlight operator notes:

- Confirm the build processes in App Store Connect and lands on the
  internal TestFlight app for `com.harpa.pro.dev`.
- Add the five internal testers/group for P5.1. Do not invite external
  testers until the beta-widening checkpoint.
- Smoke-test sign-in, project creation, voice note, photo note, report
  generation, PDF export/share, Sentry-free startup, API URL override to
  the dev backend or a PR preview, and universal links for the dev app.

Play internal operator notes:

- Confirm the `com.harpa.pro.dev` build lands on the Play internal track.
- Add the same internal tester list or Google Group used for P5.1.
- If Play blocks metadata upload because the track has no release yet,
  run `bundle exec fastlane submit_preview` once after an EAS preview
  build exists, then re-run `metadata_preview` or `beta`.
- Verify Android install/update, sign-in, voice recording codec, photo
  upload, report generation, PDF export/share, and links.

### Production smoke

After internal QA sign-off, run a narrow production smoke with the real
app identifiers and production backend. Keep this to seeded/demo accounts
and non-destructive checks; do not use production as the everyday QA
database.

```sh
FASTLANE_SKIP_UPDATE_CHECK=1 bundle exec fastlane doctor
FASTLANE_SKIP_UPDATE_CHECK=1 bundle exec fastlane metadata_production
FASTLANE_SKIP_UPDATE_CHECK=1 bundle exec fastlane beta_production
```

`beta_production` builds the EAS `production` profile and auto-submits
the created `com.harpa.pro` binaries with the EAS `production-internal`
submit profile: production App Store Connect/TestFlight app `6776759817`
and Play internal track for package `com.harpa.pro`.

### App Review demo account

App Store Connect reviewer credentials use a demo account through the
normal email entry screen and then a password on the second screen:

1. Set `DEMO_ACCOUNT_EMAILS` on the production API to one or more demo
   addresses: `demo@harpapro.com`, `demo2@harpapro.com`, or
   `demo3@harpapro.com`.
2. Generate a strong demo password and store it as the server-only
   production API secret `DEMO_ACCOUNT_PASSWORD`. Do not expose it through
   mobile env or client code.
3. Prepare demo data for that account before submission. The repo does
   seed the demo credential account, but does not currently have a
   production demo-data seed. Use the app/API under the chosen demo
   account, or add a dedicated seed script before relying on automated
   setup.
4. In App Store Connect, enter the reviewer note in this shape:

   ```text
   Sign in with email:
   demo@harpapro.com

   On the next screen, enter this password:
   <demo password>

   This uses the normal app sign-in flow. No email OTP is required for
   the demo account.
   ```

Do not commit the demo password. Rotate it by changing `DEMO_ACCOUNT_PASSWORD`
and updating the App Store Connect review note for the next submission.

### Account deletion review note

Production builds expose account deletion from Profile -> Account
Details -> Delete account. The flow uses an in-app `AppDialogSheet`,
loads `GET /me/deletion-preview`, requires the user to type their
account email, calls `DELETE /me`, clears local caches, and signs out.

Deletion removes the user's auth account, sessions, settings, usage
events, personal file rows, owned R2 objects, safe-prefix R2 orphans,
and solo projects. Shared project records remain available to remaining
members; if the deleted account was the only owner, ownership transfers
to the oldest remaining member. Mention this shared-record retention in
App Review notes or privacy-policy updates if reviewers ask how
collaborative data is handled.

The database transaction creates durable immediate and delayed R2 jobs.
The route attempts immediate cleanup; the storage worker retries failures
and runs the final exact-key pass after every signed PUT has expired.
Inspect `app.storage_delete_jobs` for `attempt_count` / `last_error`;
worker failures also reach structured logs and Sentry. PR preview apps
return `503` for account deletion because they intentionally have no
always-on worker.

### Production release

Production release is manual after production smoke sign-off. Prefer
promoting the same internally tested build in App Store Connect and Play
Console when possible. Use the Fastlane production release lane only when
you intentionally want a fresh production build/submission:

```sh
FASTLANE_SKIP_UPDATE_CHECK=1 bundle exec fastlane doctor
FASTLANE_SKIP_UPDATE_CHECK=1 bundle exec fastlane metadata_production
FASTLANE_SKIP_UPDATE_CHECK=1 bundle exec fastlane release
```

Run `screenshots_production` and `app_privacy_production` before this
only when the reviewed local assets/JSON changed. After `release`
finishes, operators complete the final App Store review submission and
Play production rollout in the store consoles. Use a phased rollout for
GA (1% -> 10% -> 50% -> 100%) and watch Sentry crash-free sessions,
API 5xx rate, auth success, and AI provider errors before each step.

## Secrets

Application runtime secrets live in
[Doppler](https://dashboard.doppler.com/workplace/6ef00a4d1fa271746160/projects/harpa-pro)
under project `harpa-pro`. The branch-specific `ADMIN_DATABASE_URL` is the
one runtime exception: deployment workflows resolve it from Neon and stage it
directly on Fly. CI control-plane credentials such as `NEON_API_KEY` and
`FLY_API_TOKEN` remain GitHub Actions secrets. Doppler configs:

| Doppler config | Used for                                | Mirrors local file |
| -------------- | --------------------------------------- | ------------------ |
| `dev`          | dev Fly app + dev CI deploys            | `.env.dev`         |
| `prd`          | prod Fly app + prod CI deploys          | `.env.prod`        |
| `dev_personal` | per-developer overrides on top of `dev` | `.env.local`       |

`.env.example` lists application variables and common deployment variables.
Workspace-specific examples list additional test and tool values. The three
live variants (`.env.local`, `.env.dev`, and `.env.prod`) are gitignored.
Deployment-resolved values, such as `ADMIN_DATABASE_URL`, do not mirror
Doppler.

An administrator's login password is not a deployment secret. The
`admin:set-password --password-stdin` command hashes it into the independent
admin database, and the operator stores the original in a password manager.
Before hashing or writing, the command rejects a matching application
endpoint and a connected target containing `app._migrations`.

### API production boot contract

The Fly prod and dev apps both run with `NODE_ENV=production` and
`HARPAPRO_PR_BUILD=0`. The API fails at boot unless all of the following
are true:

- `DATABASE_URL` and `ADMIN_DATABASE_URL` are both present and do not resolve
  to the same host and port. Neon's direct and `-pooler` forms count as one
  endpoint. `ADMIN_DATABASE_URL` is a direct connection to the environment's
  branch in `harpa-pro-admin`.
- `MIGRATIONS_REQUIRED_HEAD` and `ADMIN_MIGRATIONS_REQUIRED_HEAD` are baked
  into the image.
- `BETTER_AUTH_SECRET` is explicitly set to at least 32 characters and
  is not the checked-in development fallback.
- AI is live (`AI_LIVE=1`, `AI_FIXTURE_MODE=live`) with OpenAI and Groq
  keys.
- R2 is live with an account ID or explicit endpoint plus both access
  credentials.
- Turnstile and Resend are live with their respective secret/API key.
- `EMAIL_OTP_LIVE=1` and `RATE_LIMIT_BACKEND=postgres`.

Per-PR Fly previews set `HARPAPRO_PR_BUILD=1`, so they may use fixture
services and the memory rate limiter. They still require separate application
and admin database URLs and an explicit production-grade Better Auth secret
because preview sessions are signed the same way as other production-mode
sessions.

### Day-to-day

```sh
# Run a command with Doppler-injected env (no .env file needed):
doppler run -- pnpm --filter @harpa/api dev

# Sync local files ⇄ Doppler:
pnpm secrets:pull:dev    # Doppler dev   → .env.dev
pnpm secrets:pull:prod   # Doppler prd   → .env.prod
pnpm secrets:push:dev    # .env.dev      → Doppler dev   (after editing)
pnpm secrets:push:prod   # .env.prod     → Doppler prd

# Fly secret sync is deployment-workflow-owned; see below.
```

The repo is linked with `doppler setup --project harpa-pro --config dev`
(stored in `~/.doppler/.doppler.yaml`). New developers run this once
after cloning + `doppler login`.

Do not use the legacy `pnpm secrets:fly:dev` or
`pnpm secrets:fly:prod` shortcuts after the admin database split. They import
the raw Doppler stream and cannot resolve the correct admin Neon branch or
preserve Fly-TOML-owned CORS configuration. The environment deployment
workflow is authoritative.

### CI

The `api-dev` and `api-prod` workflows sync Doppler → Fly secrets
**inside the deploy job** before `flyctl deploy`. Pattern:

```yaml
- uses: dopplerhq/cli-action@v4
- name: Sync Fly secrets from Doppler
  env:
    DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN_DEV }} # or _PRD
    FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
  run: |
    {
      doppler secrets download --no-file --format env \
        | grep -vE '^(DOPPLER_|NEON_|FLY_|CLOUDFLARE_|PUBLIC_|EXPO_PUBLIC_|PAGES_PROJECT|PORT|NODE_ENV|ADMIN_EMAIL|ADMIN_DATABASE_URL=|ADMIN_CORS_ORIGINS=|BETTER_AUTH_URL=)'
      echo "ADMIN_DATABASE_URL=$ADMIN_DATABASE_URL"
      echo "BETTER_AUTH_URL=<canonical-environment-api-url>"
    } | flyctl secrets import --stage --app <app>
- name: Deploy
  run: flyctl deploy ...
```

Deployment workflows use action releases that run on Node 24. Cloudflare Pages
publishes Git-connected browser applications through its GitHub App. GitHub
Actions retains tests and exact-SHA HTTP verification but holds no Cloudflare
credential.

The root lint job runs `pnpm test:docs:links`. It checks repository Markdown
links and local image references before merge.

`--stage` defers activation. The subsequent `flyctl deploy` activates the
secrets. To rotate a secret, edit Doppler and dispatch the matching API
workflow. A normal code change follows the protected `dev` and `main` flow.

The `DOPPLER_TOKEN_{DEV,PRD}` service tokens are created with
`doppler configs tokens create ci-github --project harpa-pro --config <env>`
and stored as GitHub Actions repo secrets.

Before that import, the workflow resolves the environment's direct
`harpa_admin` URI from Neon's API:

- GitHub repository variable `NEON_ADMIN_PROJECT_ID` identifies
  `harpa-pro-admin`;
- GitHub secret `NEON_API_KEY` authorizes branch and URI operations;
- database and owner names are the non-secret constants `harpa_admin` and
  `harpa_admin_owner`; and
- the resolved URI is masked and staged as `ADMIN_DATABASE_URL`.

The Doppler filter deliberately excludes `ADMIN_DATABASE_URL`,
`ADMIN_CORS_ORIGINS`, and `BETTER_AUTH_URL`. This prevents stale Doppler
values from overriding the exact Neon branch URI, the non-secret exact-origin
setting in Fly TOML, or the API's public auth base URL. The workflows append
the canonical `BETTER_AUTH_URL` themselves:

- dev: `https://harpa-pro-api-dev.fly.dev`;
- production: `https://api.harpapro.com`.

The API fails boot when a non-preview deployment uses any other auth base URL.
The filter also excludes Doppler metadata, Neon control-plane values,
Cloudflare tokens, build-time `PUBLIC_*` / `EXPO_PUBLIC_*`, and other CI-only
flags. Before importing, the workflow removes any legacy
`ADMIN_CORS_ORIGINS` Fly secret so the checked-in Fly TOML value cannot remain
shadowed.

- `.env.example` lists every mobile `EXPO_PUBLIC_*` variable parsed by
  `apps/mobile/lib/config/env.ts`.

## Observability

- **Sentry** for crashes in mobile, dashboard, and API. Runtime/build vars:
  - API: `SENTRY_DSN`, optional `SENTRY_ENVIRONMENT`, and
    `SENTRY_TRACES_SAMPLE_RATE`.
  - Mobile: `EXPO_PUBLIC_SENTRY_DSN` at Metro/EAS build or OTA-update
    time.
  - Dashboard: optional public `VITE_SENTRY_DSN` Cloudflare build variable.
    The Pages build wrapper derives `VITE_SENTRY_ENVIRONMENT` from the branch
    and `VITE_SENTRY_RELEASE` from `CF_PAGES_COMMIT_SHA`. When the DSN is
    absent, the dashboard does not initialize telemetry.
  - Source maps/native build integration: `SENTRY_ORG`,
    `SENTRY_PROJECT`, optional `SENTRY_URL`, and `SENTRY_AUTH_TOKEN`
    with `project:write`.
    Mobile Sentry values live in EAS project environment variables:
    `development`, `preview`, and `production`. `apps/mobile/eas.json`
    pins each build profile to its matching EAS environment, and the
    OTA workflows pass `eas update --environment <env>` so update
    bundles receive the same values.
    The Expo plugin disables auto-upload when `SENTRY_AUTH_TOKEN` is not
    present so local prebuilds do not fail.
- **Fly metrics** provide provider-side Machine and HTTP telemetry.
- **Fly logs** capture application stdout and stderr. The repository has no
  Better Stack drain or shipping configuration. Verify any external drain in
  Fly before relying on it.
- **Request ID** middleware returns `X-Request-Id` on every API response.
  Error paths add it to console output and Sentry context. The API has no
  global structured request-log middleware. `REQUEST_LOG` is parsed but has no
  runtime consumer.

## Deploy flow

> Detailed pipeline, migration apply, and rollback playbook in
> [arch-cicd-and-migrations.md](arch-cicd-and-migrations.md). The flow
> below is the high-level summary.

Feature pull requests target `dev`. Production promotions use a `dev` to
`main` pull request. Do not merge a feature branch directly to `main`.

The Fly release command applies migrations in this fixed order:

1. `db:migrate` against `DATABASE_URL`;
2. `db:migrate:admin` against `ADMIN_DATABASE_URL`; and
3. the existing Better Auth test/demo account seed, where applicable.

The image carries both `MIGRATIONS_REQUIRED_HEAD` and
`ADMIN_MIGRATIONS_REQUIRED_HEAD`. Fly's machine health check remains the
application-only `/readyz`, so an admin database incident does not remove the
otherwise healthy mobile/product API from service. Deployment workflows
verify `/admin/readyz` separately after deploy; it checks the admin
connection and `admin._migrations` head and fails the deployment workflow
without coupling Fly routing to admin availability.

```
PR open / push
  ↳ Credential-free tests, builds, path checks, and migration guards
  ↳ Human-owned same-repository PRs only:
    ↳ exact Git ref pr-<n> mirrors the immutable PR head
    ↳ Backend preview (API, admin-site, or dashboard changes):
      ↳ Application Neon branch pr-<n> (pr-preview.yml: neon-create)
      ↳ Admin Neon branch pr-<n> from admin dev
      ↳ Fly app harpa-pro-api-pr-<n> created/deployed (pr-preview.yml: fly-preview)
        ↳ release_command applies app migrations, admin migrations, then
          seeds configured test/demo password accounts
        ↳ /readyz verified
        ↳ /admin/readyz verified separately
        ↳ sticky PR comment with preview URL
    ↳ Cloudflare Git builds public/admin/dashboard previews from pr-<n>
      ↳ GitHub verifies the stable aliases serve the exact PR head SHA
      ↳ dashboard-preview.yml verifies SPA routing and runs its deployed live
         browser journey against the matching isolated API
    ↳ EAS Update → `development` channel (mobile-ota-pr.yml)
      ↳ bundle's API override is `harpa-pro-api-pr-<n>.fly.dev`
        when the PR changes API inputs
      ↳ otherwise bundle's API override is `harpa-pro-api-dev.fly.dev`
      ↳ branch is last-write-wins; engineers select older PR bundles
        via the dev-client launcher (Updates → development → pick)
  ↳ EAS preview build (manual trigger — planned)

Human-owned same-repository PR close
  ↳ generated Git ref pr-<n> deleted
  ↳ Fly app harpa-pro-api-pr-<n> destroyed (pr-preview.yml: fly-destroy)
  ↳ Application and admin Neon branches pr-<n> deleted

Push to dev
  ↳ Application and admin Neon `dev` branches ensured
  ↳ app migrations applied to application `dev`
  ↳ admin migrations applied to admin `dev`
  ↳ Fly deploy → harpa-pro-api-dev (api-dev.yml)
    ↳ /readyz and /admin/readyz verified independently
  ↳ Cloudflare Git deploys public/admin/dashboard `dev` branches
    ↳ site-dev.yml, admin-dev.yml, and dashboard-dev.yml verify exact SHA
    ↳ dashboard-dev.yml also verifies SPA routing
  ↳ EAS Update → `preview` channel (mobile-ota-dev.yml)
    ↳ mobile-only change: publish directly
    ↳ API-dependent change: api-dev calls OTA after deploy + journeys pass
    ↳ appVersion change: skip until the matching native build exists
  ↳ Fastlane `beta` (manual): metadata -> EAS preview build --auto-submit

PR to main (production gate)
  ↳ checkout the PR head SHA, not GitHub's synthetic merge ref
  ↳ require harpa-pro-api-dev /healthz.gitCommit to equal that full 40-character SHA
  ↳ run stress/core/extended journeys against that exact dev deploy

Push to main (production)
  ↳ blocking recovery branches of application and admin Neon `main` branches
  ↳ Fly deploy → harpa-pro-api
    ↳ release_command applies app migrations, then admin migrations
    ↳ /readyz and /admin/readyz verified independently
  ↳ Cloudflare Git deploys approved production branches
    ↳ site-prod.yml and admin-prod.yml verify exact SHA + custom domains
    ↳ dashboard-prod.yml verifies the Pages hostname and any approved custom
       domain after dashboard production activation
  ↳ EAS Update → `production` channel (mobile-ota-prod.yml)
    ↳ mobile-only change: publish directly
    ↳ API-dependent change: api-prod calls OTA after deploy + journeys pass
    ↳ appVersion change: skip until the matching native build exists
  ↳ Fastlane `release` (manual approve): metadata -> EAS production build --auto-submit
```

Use the protected GitHub workflows for normal deployment. The local
`infra/fly/deploy.sh` helper always targets production through
`infra/fly/fly.toml`; it does not read `FLY_APP`. It labels the image from
local `HEAD` but does not prove that the checkout is clean or pushed. Before
an approved emergency use, compare `git status --short`, the local SHA, and
the remote branch SHA, then record the deployed image digest.

### Mobile OTA and native runtime ordering

`apps/mobile/app.config.ts` uses Expo's `appVersion` runtime policy, so the
root `package.json` version is also the native runtime identifier. Keep that
version stable for ordinary JS, API, and documentation merges. This lets an
OTA update target the preview or production binary that is already installed.
There is no automatic per-merge version bump.

Every OTA also requires an annotated readiness tag for its environment and
version:

- Preview: `mobile-preview-runtime-v<appVersion>`
- Production: `mobile-production-runtime-v<appVersion>`

The tag points at the commit used for the native build, and its annotation
records the EAS build ID or store build reference. It is created only by the
manual post-build registration job. A version bump alone is not readiness.
The policy also refuses an existing tag when native-sensitive files changed
after its tagged commit without another version bump. Conservatively, this
includes changes to the repository lockfile (`pnpm-lock.yaml`) and native
package patches (`patches/**`), because either can alter the installed binary.

After that native gate, the OTA workflows have two automatic paths:

1. A mobile-only push publishes its exact push SHA directly.
2. A push that also changes API inputs does not publish from the push
   workflow. The matching API workflow calls the reusable OTA workflow only
   after its deploy, `/readyz` check, and journey tests succeed.

Before either path reaches EAS, `scripts/ci/verify-api-release.sh` checks the
deployed API SHA from `/healthz` and re-checks `/readyz`. An older deployed SHA
is accepted only when it is an ancestor of the OTA commit and every commit
after it is free of API, contract, deployment, and lockfile changes. Otherwise
the API must report the exact OTA SHA. This full-history check prevents a later
mobile-only push from publishing after an earlier API-and-mobile deploy failed.

Native changes must include an intentional root `package.json` version bump.
This includes Expo config/plugin changes and native dependency changes. That
version change makes automatic OTA publication stop; do not work around the
gate by reverting the bump. Release in this order:

1. Merge the native change and version bump.
2. Build, install, and smoke-test the matching binary with Fastlane `beta`
   (preview) or `beta_production` / `release` (production).
3. Manually dispatch `mobile-ota-dev` or `mobile-ota-prod` on the same ref,
   supplying the commit when necessary, confirming `native_runtime_ready`,
   and recording the EAS/store reference in `native_artifact`.

That dispatch creates the environment/version readiness tag before the OTA
job evaluates its policy. If publication fails afterward, leave the tag in
place—it still correctly attests the native artifact—and retry the dispatch.
Only a direct dispatch of the mobile OTA workflow performs this registration.
A manually dispatched API deployment may call the reusable OTA workflow after
its gates pass, but it remains an automatic policy evaluation and does not
consume the native registration inputs.
Normal rotation is a new app version, native artifact, and new tag. Never
force-move a readiness tag to a different native commit. If a tag was created
for the wrong artifact or commit, stop releases and bump the app version to
produce a corrected artifact/tag; treat deleting the exact bad remote tag as
an exceptional recovery action requiring owner approval.

Use the same checked-in app version when promoting an already-tested native
release from `dev` to `main`; do not create a second production-only bump.
The production artifact gets its own production readiness tag before the
manual OTA publication. On first adoption, register the already-distributed
binary for the current version in each environment before expecting automatic
OTA publication.

## Dev environment bootstrap (one-time)

```bash
# 1. Create the Fly app
flyctl apps create harpa-pro-api-dev

# 2. Create the application Neon `dev` branch
APP_URI=$(pnpm db:branch:ensure dev)

# 3. Create admin Neon `dev` from `main` and capture its direct URI
ADMIN_URI=$(
  NEON_PROJECT_ID="$NEON_ADMIN_PROJECT_ID" \
  NEON_DATABASE_NAME=harpa_admin \
  NEON_ROLE_NAME=harpa_admin_owner \
  pnpm --silent db:branch:ensure dev main
)

# 4. Set Fly secrets (mirror prod, with dev-specific values)
flyctl secrets set --app harpa-pro-api-dev \
  DATABASE_URL="$APP_URI" \
  ADMIN_DATABASE_URL="$ADMIN_URI" \
  BETTER_AUTH_SECRET=... \
  EMAIL_OTP_LIVE=1 \
  RESEND_LIVE=1 RESEND_API_KEY=... \
  TURNSTILE_LIVE=1 TURNSTILE_SECRET_KEY=... \
  RATE_LIMIT_BACKEND=postgres \
  WAITLIST_CORS_ORIGINS="https://dev.harpa-pro.pages.dev" \
  R2_FIXTURE_MODE=live \
  R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
  R2_BUCKET=harpa-pro-dev \
  AI_FIXTURE_MODE=live AI_LIVE=1 \
  OPENAI_API_KEY=sk-... GROQ_API_KEY=gsk-... # AI providers
```

`ADMIN_CORS_ORIGINS=https://dev.harpa-pro-admin.pages.dev` is non-secret Fly
configuration in `infra/fly/fly.dev.toml`, not a Doppler value.

After bootstrap, every push to `dev` reuses both Neon `dev` branches and the
same Fly app. The workflow resolves and stages the current admin URI, applies
both migration streams, and ships new code.

No real administrator is auto-seeded. After the admin migration succeeds,
an operator sets `ADMIN_DATABASE_URL` to the intended branch and runs the
stdin-only `admin:set-password` procedure in
[arch-auth-and-rls.md](arch-auth-and-rls.md#identity-and-password-boundary).

App versions change only in intentional native-release commits, as described
above. Normal merges to `dev` retain the current version and runtime so the
installed preview binary remains eligible for OTA updates.

## Scaling

The API is currently tuned to **sleep when idle** and **absorb spikes**
without operator intervention. Tuning lives in
[`infra/fly/fly.toml`](../../infra/fly/fly.toml). Restore the prod warm
floor described below when main should stay hot again.

### Cold starts

| Lever                              | Prod                     | Dev                      |
| ---------------------------------- | ------------------------ | ------------------------ |
| `auto_stop_machines`               | `"suspend"`              | `"suspend"`              |
| `min_machines_running`             | `0`                      | `0`                      |
| Effect on first request after idle | cold-resume (~300-500ms) | cold-resume (~300-500ms) |

`"suspend"` keeps the machine's memory snapshot on disk so resume is
sub-second; `"stop"` would re-boot the container (~3-5s) and re-run
the readiness probe (+1-2s extra latency until first request).

Prod currently allows full idle sleep while main does not need warm HA.
The trade-off is that the first request after idle pays resume latency,
and there is no always-warm standby during deploys or restarts. When
prod should stay hot again, restore `min_machines_running = 2`: one
machine absorbs traffic if the other is restarting or being replaced by
a deploy, avoiding the v3 single-machine restart failure mode. Cost
delta: ~$3.80/mo for the extra `shared-cpu-1x` machine.

### Storage lifecycle worker

Production and dev each run one `storage-worker` process group in
addition to the HTTP `app` group:

- `app`: `shared-cpu-1x`, 512 MB, attached to `http_service`, allowed
  to suspend at zero;
- `storage-worker`: `shared-cpu-1x`, 512 MB, no service attachment,
  with its active Machine and stopped standby owned by Fly deploys.

The active worker is not eligible for HTTP auto-stop, so both dev and
production carry one continuously billed worker Machine. Fly also preserves a
stopped standby for deploys and restarts. This cost is required for delayed
cleanup to run while the API is idle. PR previews do not provision workers;
their account-deletion gate stays closed.

The worker process launches Node with the `tsx` loader directly instead of
keeping `pnpm` and the `tsx` CLI supervisor resident. The 512 MB allocation is
intentional headroom: the former 256 MB Machine exposed only about 207 MiB to
the guest and reached roughly 9 MiB available while its durable queue was
empty, followed by four daily OOM/exit-137 restarts. A structured
`storage_delete_worker_memory` log records process uptime, Node RSS/heap, and
guest total/free memory at startup and hourly. Fly's built-in Machine memory
metric remains the source for whole-VM saturation and should be checked after
each rollout.

The worker does not continuously pin Neon with five-second polling. It
sleeps until the next known job is due, capped at ten minutes to discover
jobs inserted after the sleep was calculated, and prunes expired upload
leases hourly. The route remains the immediate-delete fast path. If that
fast path fails just after a sleep starts, cleanup may lag by ten minutes;
expired lease/orphan cleanup may lag by one hour. These gaps allow an
otherwise idle Neon compute to suspend when its configured idle threshold
is shorter than the gap. They do not reduce the continuously billed Fly
worker cost.

After the first lease-aware deploy completes, the workflow arms a
one-time 330-second compatibility grace. During the grace, new presigns
are leased, lease-less registrations from replaced machines remain
compatible, and account deletion returns `503`. Arming uses
`COALESCE(enforce_after, ...)`, so subsequent deploys cannot reopen the
grace. `R2_PRESIGN_TTL_SEC` is capped at 300 seconds; the remaining 30
seconds is the late-PUT safety window.

`infra/fly/deploy.sh` owns the production order: deploy, narrowly repair the
known exact singleton states, verify at least one Machine has state
`started` and metadata process group `storage-worker`, then arm by running the
monotonic rollout command on that exact Machine. Arming uses Fly Machine exec,
whose per-attempt timeout is 120 seconds, for at most three attempts. A failed
attempt is retried only after a fresh inventory proves the same worker id is
still the sole started worker. This is safe when transport fails after the SQL
commit because the database update uses `COALESCE` and boolean `OR`, so later
attempts cannot reopen the grace or disable deletion. Success also requires the
arming script's confirmation marker, not only a zero provider exit code.

The command inherits the app's staged Fly secrets, so neither CI nor manual
callers need the production `DATABASE_URL`. The GitHub deploy step has a
30-minute outer timeout in case another provider operation ignores its own
deadline. The shell policy test stubs external commands, executes this
sequence, verifies the bounded retry budget, and forbids explicit
`storage-worker` scale commands.

The shared repair is a no-op only for an exact healthy pair: one
current-release active worker and one current-release stopped, service-less
standby whose sole `config.standbys` entry is that active Machine's id. A
singleton current-release active worker is freshly re-listed and must remain
the same sole started/no-standby id before it gets exactly one standby clone. A
singleton current-release stopped standby first has its standby configuration
cleared. A fresh inventory must then prove that the same id remains the sole
current-release, service-less worker with no standby configuration. If stopped,
repair runs `flyctl machine start ID --app APP`; if already started, it skips
the redundant start. It polls at most ten fresh inventories three seconds apart,
allowing only that same candidate in `stopped`, `starting`, or `started` state,
and clones only after exact `started` proof. Both mutating paths list Machines
again and succeed only after observing the exact healthy pair.

Every app and worker Machine used by the decision must match one complete,
unambiguous identity: nonempty `fly_release_id`, `fly_release_version`, and a
valid full tagged `config.image`. Fly may return the same tag with an optional
`@sha256:<64 lowercase hex>` suffix, so repair strips only that validated suffix
before comparison; repository, tag, release id, and release version remain
exact. Tag-only Machines may coexist with one observed explicit digest, but more
than one distinct non-null digest across the app and worker Machines fails
closed. Untagged, digest-only, malformed, stale, or mixed identities fail before
mutation. If standby clearing succeeds but later work fails, an exact singleton
stopped/no-standby retry starts then verifies the candidate, while an exact
singleton started/no-standby retry clones it. Id, identity, service, standby, or
topology drift during any pre-clone re-list or polling fails before cloning.

The verifier remains diagnostic-only. The workflow calls it again after
repair and before arming. This proves that a running executor exists. It does
not by itself prove that lifecycle arming finished; rely on the arming
command's confirmation marker and the rollout table below. If a deployment
stalls before that marker is reported, treat the rollout state as unknown and
inspect it before retrying:

```sql
SELECT armed_at, enforce_after, account_delete_enabled, updated_at
FROM app.storage_lifecycle_rollout
WHERE singleton = TRUE;
```

Fly can create a stopped standby for the service-less process group. An
explicit `storage-worker=1` command therefore collapses the pair without
preferring the active Machine. After #210 added `--yes`, Fly destroyed the
active worker and retained the stopped standby. The earlier confirmation prompt
was a safety signal, not a reason to auto-confirm the scale-down; dev and
production never use broad process-count repair. The narrow recovery above
exists only for singleton current-release active, stopped/no-standby, or
standby states. Fly later confirmed in its deploy log that updating a
previously non-started Machine can leave the new version stopped, which is why
repair uses an explicit start and does not treat update success as running
proof. Fly also rendered a cloned standby's image as the same full deployment
tag with an attached digest, so repair removes only a validated digest suffix
for tag comparison, keeps the repository, tag, release id, and release version
exact, and rejects conflicting explicit digests.

Operational query:

```sql
SELECT user_id, job_kind, run_after, attempt_count, locked_at, last_error
FROM app.storage_delete_jobs
ORDER BY run_after;
```

### Burst scaling

[`[http_service.concurrency]`](../../infra/fly/fly.toml) tells Fly's proxy when
an existing Machine is too busy to receive more work:

- `soft_limit = 25` — once a machine has 25 in-flight requests, Fly routes
  new connections to another available Machine.
- `hard_limit = 50` — Fly stops sending to a machine entirely until
  it drains below the soft limit.

Concurrency settings do not create a maximum Machine count or add Machines.
Capacity changes are explicit operations. Before changing the app process
count, record the current process groups and worker topology:

```bash
flyctl scale show --app harpa-pro-api
flyctl machine list --app harpa-pro-api
```

With owner approval, set only the HTTP process group to an exact count:

```bash
flyctl scale count <count> --process-group app --app harpa-pro-api
```

Do not omit `--process-group`. A broad scale command can also change the
service-less `storage-worker` group. After a count change, rerun the Machine
inventory and confirm the worker pair is unchanged. `--max-per-region` controls
distribution of the requested count; it is not an autoscaling ceiling.

### Multi-region (future)

`primary_region = "fra"` today. Multi-region placement is not configured.
It requires an explicit Machine topology, database-latency design, failure
policy, and verification plan. Do not treat it as a one-command change.

### Neon connection pooling

Spike traffic × active machine count × `pg.Pool.max` can quickly exceed
Neon's per-compute connection limit. Two safety nets:

1. **Application `DATABASE_URL` must point at Neon's pooler endpoint** —
   hostname
   contains `-pooler` (e.g. `ep-foo-bar-pooler.eu-central-1.aws.neon.tech`).
   The pooler multiplexes thousands of client connections onto the
   compute's actual limit. Verify with:
   ```bash
   fly secrets list -a harpa-pro-api | grep DATABASE_URL  # shows digest only
   doppler secrets get DATABASE_URL --plain | grep -o '[^@]*$'  # full host
   ```
2. **`pg.Pool.max = 10`** per application Machine. Total possible client
   connections grow with the active Machine count. Verify the current Neon
   plan and endpoint limits before increasing Fly capacity.

If the pooler hostname is missing, the API still works but Neon's
compute will saturate well before Fly does and you'll see
`too many connections for role` errors under load. The pooled
hostname is a one-time secret swap, not a code change.

`ADMIN_DATABASE_URL` is intentionally different: it is the direct,
unpooled URI for the selected `harpa-pro-admin` branch. The admin migration
loader holds a session advisory lock, which transaction pooling cannot
guarantee. Admin runtime traffic uses that direct URI through a distinct pool
capped at five connections per Fly machine. Connection establishment, queued
checkout, and statements each have a five-second deadline. Do not replace it
with a pooled URI unless migrations receive a separate direct connection
variable.

### Verifying scale in prod

```bash
flyctl status --app harpa-pro-api
flyctl scale show --app harpa-pro-api
flyctl machine list --app harpa-pro-api
flyctl logs --app harpa-pro-api
```

## Alerts

The repository configures Sentry capture, Fly health checks, and deployment
smokes. It does not configure PagerDuty, Slack alert routes, or percentage
thresholds. Treat those integrations as unknown until they are verified in
the provider consoles. Record the destination, threshold, owner, and a test
event when an external alert is enabled.

## Budget guards

- AI: per-user monthly token budget enforced server-side; usage
  visible on the in-app `usage` screen.
- R2: application jobs remove expired uploads and account-owned objects. No
  bucket-native R2 lifecycle policy is configured in this repository; see
  [arch-storage.md](arch-storage.md).
- Neon: application and admin PR branches auto-delete on PR close. CI also
  prunes stale branches and pre-deploy recovery branches in both projects.
