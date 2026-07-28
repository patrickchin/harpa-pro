# Observability + Ops

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
    `.github/workflows/pr-preview.yml` (job `fly-preview`) only when
    the PR changes API inputs (`packages/api`, `packages/api-contract`,
    `packages/ai-fixtures`, lockfile, or TS config), destroyed on PR
    close (job `fly-destroy`). Config:
    [`infra/fly/fly.preview.toml`](../../infra/fly/fly.preview.toml).
    Single shared-cpu-1x machine, `min_machines_running = 0`,
    `auto_stop_machines = "stop"`. Forks skipped (no `FLY_API_TOKEN`).
    The preview's `DATABASE_URL` points at the matching Neon `pr-<n>`
    branch; frontend-only PR bundles point at the shared dev API
    instead. Mobile dev/preview builds can flip to a preview URL via
    `setApiBaseUrlOverride`.
- **Database**: Neon (managed). Long-lived branches: `main` (prod)
  and `dev`. Per-PR `pr-<n>` branches are created/destroyed by
  `.github/workflows/pr-preview.yml` for API-changing PRs only. See
  [arch-database.md](arch-database.md).
- **Storage**: Cloudflare R2. Separate buckets per env
  (`harpa-pro` / `harpa-pro-dev`). See [arch-storage.md](arch-storage.md).
- **Public site**: Astro app `apps/site` on Cloudflare Pages project
  `harpa-pro`. One static deployment serves marketing, roadmap, legal, and
  product guides at `https://harpapro.com/docs`.
  - Production branch `main` → `https://harpapro.com` (and
    `harpa-pro.pages.dev`).
  - Dev branch `dev` → `https://dev.harpa-pro.pages.dev`.
  - After cutover, the standalone hostname `docs.harpapro.com` redirects to
    the canonical `/docs` routes through Cloudflare zone rules. See
    [the Cloudflare Pages runbook](../marketing/deploy-cloudflare-pages.md).
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
  bundle install --path vendor/bundle
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
  once for that track and re-run the metadata lane.
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

| Target | iOS bundle id / ASC app id | Android package | Store role |
| ------ | -------------------------- | --------------- | ---------- |
| Preview | `com.harpa.pro.dev` / `6776967689` | `com.harpa.pro.dev` | TestFlight + Play internal QA on dev backend |
| Production | `com.harpa.pro` / `6776759817` | `com.harpa.pro` | App Review, final smoke, App Store + Play production |

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
bundle install --path vendor/bundle
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
events, personal file rows, and solo projects. Shared project records
remain available to remaining members; if the deleted account was the
only owner, ownership transfers to the oldest remaining member. Mention
this shared-record retention in App Review notes or privacy-policy
updates if reviewers ask how collaborative data is handled.

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

All non-public secrets live in [Doppler](https://dashboard.doppler.com/workplace/6ef00a4d1fa271746160/projects/harpa-pro)
under project `harpa-pro`. Configs:

| Doppler config | Used for                                  | Mirrors local file |
| -------------- | ----------------------------------------- | ------------------ |
| `dev`          | dev Fly app + dev CI deploys              | `.env.dev`         |
| `prd`          | prod Fly app + prod CI deploys            | `.env.prod`        |
| `dev_personal` | per-developer overrides on top of `dev`   | `.env.local`       |

`.env.example` (committed) enumerates every var. The three live
variants (`.env.local` / `.env.dev` / `.env.prod`) are gitignored and
are the local mirror of what's in Doppler.

### API production boot contract

The Fly prod and dev apps both run with `NODE_ENV=production` and
`HARPAPRO_PR_BUILD=0`. The API fails at boot unless all of the following
are true:

- `BETTER_AUTH_SECRET` is explicitly set to at least 32 characters and
  is not the checked-in development fallback.
- AI is live (`AI_LIVE=1`, `AI_FIXTURE_MODE=live`) with OpenAI and Groq
  keys.
- R2 is live with an account ID or explicit endpoint plus both access
  credentials.
- Turnstile and Resend are live with their respective secret/API key.
- `EMAIL_OTP_LIVE=1` and `RATE_LIMIT_BACKEND=postgres`.

Per-PR Fly previews set `HARPAPRO_PR_BUILD=1`, so they may use fixture
services and the memory rate limiter. They still require an explicit
production-grade Better Auth secret because preview sessions are signed
the same way as other production-mode sessions.

### Day-to-day

```sh
# Run a command with Doppler-injected env (no .env file needed):
doppler run -- pnpm --filter @harpa/api dev

# Sync local files ⇄ Doppler:
pnpm secrets:pull:dev    # Doppler dev   → .env.dev
pnpm secrets:pull:prod   # Doppler prd   → .env.prod
pnpm secrets:push:dev    # .env.dev      → Doppler dev   (after editing)
pnpm secrets:push:prod   # .env.prod     → Doppler prd

# Manual Fly sync (rarely needed — CI does it on every deploy):
pnpm secrets:fly:dev     # → harpa-pro-api-dev
pnpm secrets:fly:prod    # → harpa-pro-api
```

The repo is linked with `doppler setup --project harpa-pro --config dev`
(stored in `~/.doppler/.doppler.yaml`). New developers run this once
after cloning + `doppler login`.

### CI

The `api-dev` and `api-prod` workflows sync Doppler → Fly secrets
**inside the deploy job** before `flyctl deploy`. Pattern:

```yaml
- uses: dopplerhq/cli-action@v3
- name: Sync Fly secrets from Doppler
  env:
    DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN_DEV }}  # or _PRD
    FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
  run: |
    doppler secrets download --no-file --format env \
      | grep -vE '^(DOPPLER_|NEON_|FLY_|CLOUDFLARE_|PUBLIC_|EXPO_PUBLIC_|PAGES_PROJECT|PORT|NODE_ENV|ADMIN_EMAIL)' \
      | flyctl secrets import --stage --app <app>
- name: Deploy
  run: flyctl deploy ...
```

`--stage` defers activation; the subsequent `flyctl deploy` flips the
secrets on — so code + secrets ship in a single transaction. To rotate
a secret: edit it in Doppler, push to `dev` or `main`, deploy fires
and picks up the new value.

The `DOPPLER_TOKEN_{DEV,PRD}` service tokens are created with
`doppler configs tokens create ci-github --project harpa-pro --config <env>`
and stored as GitHub Actions repo secrets.

The filter pattern excludes vars that don't belong on Fly: Doppler
metadata, Neon admin credentials (only `DATABASE_URL` is needed on
the app), Cloudflare deploy tokens, build-time `PUBLIC_*` /
`EXPO_PUBLIC_*` (consumed by the public site / mobile app at build,
not by the API at runtime), and a handful of CI-only flags.

- `.env.example` at the repo root enumerates every
  `EXPO_PUBLIC_*` var. The `lib/env.ts` Zod parse runs in CI
  against a populated `.env.example` to catch missing entries
  before merge.

## Observability

- **Sentry** for crashes, both mobile and API. Same project,
  different DSNs. Runtime vars:
  - API: `SENTRY_DSN`, optional `SENTRY_ENVIRONMENT`, and
    `SENTRY_TRACES_SAMPLE_RATE`.
  - Mobile: `EXPO_PUBLIC_SENTRY_DSN` at Metro/EAS build or OTA-update
    time.
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
- **Fly metrics** — built-in for API latency / 5xx rate.
- **Logs** — Fly log shipping to Better Stack (free tier) for
  search.
- **Request id** — every API request gets `X-Request-Id` echoed
  in responses; logged with the structured log entry; mobile
  attaches it to Sentry breadcrumbs on error.

## Deploy flow

> Detailed pipeline, migration apply, and rollback playbook in
> [arch-cicd-and-migrations.md](arch-cicd-and-migrations.md). The flow
> below is the high-level summary.


```
PR open / push (same-repo only, forks skipped)
  ↳ Backend preview (API-changing PRs only):
    ↳ Neon branch pr-<n> (pr-preview.yml: neon-create)
    ↳ Fly app harpa-pro-api-pr-<n> created/deployed (pr-preview.yml: fly-preview)
      ↳ release_command applies migrations to pr-<n>
      ↳ /readyz verified
      ↳ sticky PR comment with preview URL
  ↳ public-site preview deploy to CF Pages (site-preview.yml)
  ↳ EAS Update → `development` channel (mobile-ota-pr.yml)
    ↳ bundle's API override is `harpa-pro-api-pr-<n>.fly.dev`
      when the PR changes API inputs
    ↳ otherwise bundle's API override is `harpa-pro-api-dev.fly.dev`
    ↳ branch is last-write-wins; engineers select older PR bundles
      via the dev-client launcher (Updates → development → pick)
  ↳ EAS preview build (manual trigger — planned)

PR close
  ↳ Fly app harpa-pro-api-pr-<n> destroyed (pr-preview.yml: fly-destroy)
  ↳ Neon branch pr-<n> deleted (pr-preview.yml: neon-destroy)

Push to dev
  ↳ Neon `dev` branch ensured (idempotent, long-lived)
  ↳ migrations applied to `dev`
  ↳ Fly deploy → harpa-pro-api-dev (api-dev.yml)
  ↳ public-site deploy to CF Pages dev branch (site-dev.yml)
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
  ↳ blocking Neon `main` snapshot (api-prod.yml)
  ↳ Fly deploy → harpa-pro-api
    ↳ release_command applies migrations to Neon `main`
  ↳ public-site deploy to CF Pages production (site-prod.yml)
  ↳ EAS Update → `production` channel (mobile-ota-prod.yml)
    ↳ mobile-only change: publish directly
    ↳ API-dependent change: api-prod calls OTA after deploy + journeys pass
    ↳ appVersion change: skip until the matching native build exists
  ↳ Fastlane `release` (manual approve): metadata -> EAS production build --auto-submit
```

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
   `scripts/ci/verify-api-release.sh` then checks that `/healthz` reports the
   OTA SHA and re-checks `/readyz` before `eas update`.

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

# 2. Create the Neon `dev` branch + capture its URI
URI=$(pnpm db:branch:ensure dev)

# 3. Set Fly secrets (mirror prod, with dev-specific values)
flyctl secrets set --app harpa-pro-api-dev \
  DATABASE_URL="$URI" \
  BETTER_AUTH_SECRET=... \
  EMAIL_OTP_LIVE=1 \
  RESEND_LIVE=1 RESEND_API_KEY=... \
  TURNSTILE_LIVE=1 TURNSTILE_SECRET_KEY=... \
  RATE_LIMIT_BACKEND=postgres \
  WAITLIST_CORS_ORIGINS="https://dev.harpa-pro.pages.dev" \
  TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_VERIFY_SID=... \
  R2_FIXTURE_MODE=live \
  R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
  R2_BUCKET=harpa-pro-dev \
  AI_FIXTURE_MODE=live AI_LIVE=1 \
  OPENAI_API_KEY=sk-... GROQ_API_KEY=gsk-... # AI providers
```

After bootstrap, every push to `dev` re-uses the same Neon branch
and Fly app — the workflow only runs pending migrations and ships
new code.

App versions change only in intentional native-release commits, as described
above. Normal merges to `dev` retain the current version and runtime so the
installed preview binary remains eligible for OTA updates.

## Scaling

The API is currently tuned to **sleep when idle** and **absorb spikes**
without operator intervention. Tuning lives in
[`infra/fly/fly.toml`](../../infra/fly/fly.toml). Restore the prod warm
floor described below when main should stay hot again.

### Cold starts

| Lever | Prod | Dev |
|---|---|---|
| `auto_stop_machines` | `"suspend"` | `"suspend"` |
| `min_machines_running` | `0` | `0` |
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

### Burst scaling

[`[http_service.concurrency]`](../../infra/fly/fly.toml) tells Fly's
proxy when to wake / start additional machines:

- `soft_limit = 25` — once a machine has 25 in-flight requests, Fly
  starts routing new connections to a second (or third…) machine.
- `hard_limit = 50` — Fly stops sending to a machine entirely until
  it drains below the soft limit.

Sized for the current node-postgres pool (`max: 10` per machine)
plus headroom for non-DB-bound work (auth, validation, idle).

**Set the max machine count out-of-band** (not in fly.toml):

```bash
# Allow up to 6 machines in the primary region during a spike.
fly scale count 6 --max-per-region 6 -a harpa-pro-api
```

Steady-state Fly will keep `min_machines_running` hot (currently 0 for
prod) and let the rest stop/suspend when traffic recedes.

### Multi-region (future)

`primary_region = "fra"` today. Adding read-replica regions is a
single-step `fly regions add` once the user base demands it — Neon
read replicas exist in multiple regions and the API has no
sticky-session state. Not configured today; flag for P5+.

### Neon connection pooling

Spike traffic × active machine count × `pg.Pool.max` can quickly exceed
Neon's per-compute connection limit. Two safety nets:

1. **DATABASE_URL must point at Neon's pooler endpoint** — hostname
   contains `-pooler` (e.g. `ep-foo-bar-pooler.eu-central-1.aws.neon.tech`).
   The pooler multiplexes thousands of client connections onto the
   compute's actual limit. Verify with:
   ```bash
   fly secrets list -a harpa-pro-api | grep DATABASE_URL  # shows digest only
   doppler secrets get DATABASE_URL --plain | grep -o '[^@]*$'  # full host
   ```
2. **`pg.Pool.max = 10`** per machine. With 6 machines max that's 60
   concurrent backend connections — well inside Neon's free-tier
   limit (~100) and trivially inside paid plans.

If the pooler hostname is missing, the API still works but Neon's
compute will saturate well before Fly does and you'll see
`too many connections for role` errors under load. The pooled
hostname is a one-time secret swap, not a code change.

### Verifying scale in prod

```bash
fly status -a harpa-pro-api               # current machine count + state
fly logs -a harpa-pro-api | grep started  # see auto-starts under load
fly autoscale show -a harpa-pro-api       # current limits
```

## Alerts

- Fly app down → PagerDuty.
- 5xx rate > 1% over 5 min → Slack.
- Sentry new issue (crash) → Slack.
- AI provider failure rate > 5% over 10 min → Slack.

## Budget guards

- AI: per-user monthly token budget enforced server-side; usage
  visible on the in-app `usage` screen.
- R2: lifecycle rules cap orphan files (see [arch-storage.md](arch-storage.md)).
- Neon: PR branches auto-deleted on PR close. CI cron deletes
  branches older than 14 days.
