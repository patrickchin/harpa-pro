# Observability + Ops

## Hosting

- **API**: Fly.io. Two apps:
  - `harpa-pro-api` (prod) at `https://api.harpapro.com` — deployed on
    push to `main` by `.github/workflows/api-prod.yml`.
  - `harpa-pro-api-dev` (dev) at `https://harpa-pro-api-dev.fly.dev` —
    deployed on push to `dev` by `.github/workflows/api-dev.yml`.
    Sleeps when idle (`min_machines_running = 0`) to save cost.
  - `harpa-pro-api-pr-<n>` (per-PR preview) at
    `https://harpa-pro-api-pr-<n>.fly.dev` — created on PR open by
    `.github/workflows/pr-preview.yml` (job `fly-preview`), destroyed on
    PR close (job `fly-destroy`). Config:
    [`infra/fly/fly.preview.toml`](../../infra/fly/fly.preview.toml).
    Single shared-cpu-1x machine, `min_machines_running = 0`,
    `auto_stop_machines = "stop"`. Forks skipped (no `FLY_API_TOKEN`).
    The preview's `DATABASE_URL` points at the matching Neon `pr-<n>`
    branch; mobile dev/preview builds can flip to the preview URL via
    `setApiBaseUrlOverride`.
- **Database**: Neon (managed). Long-lived branches: `main` (prod)
  and `dev`. Per-PR `pr-<n>` branches created/destroyed by
  `.github/workflows/pr-preview.yml`. See
  [arch-database.md](arch-database.md).
- **Storage**: Cloudflare R2. Separate buckets per env
  (`harpa-pro` / `harpa-pro-dev`). See [arch-storage.md](arch-storage.md).
- **Marketing**: Cloudflare Pages project `harpa-pro`.
  - Production branch `main` → `https://harpapro.com` (and
    `harpa-pro.pages.dev`).
  - Dev branch `dev` → `https://dev.harpa-pro.pages.dev`.
- **Mobile**: Fastlane + EAS. Fastlane owns checked-in App Store /
  Play Store metadata and local release lanes; EAS owns Expo native
  builds, signing, binary submission, and OTA updates. TestFlight +
  Play internal track remain the beta distribution targets. Three build
  profiles live in `apps/mobile/eas.json`:
  - `production` — App Store / Play. `com.harpa.pro` →
    `https://api.harpapro.com`.
  - `preview` — internal / TestFlight. `com.harpa.pro.dev` →
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
  bundle exec fastlane beta
  bundle exec fastlane release
  ```

  `doctor` is safe: it validates Bundler/Fastlane, `pnpm`, EAS config,
  and metadata files, then prints the EAS commands without uploading
  metadata, starting a build, or submitting a binary. `beta` pushes
  preview/internal store metadata, then starts the `preview` EAS build
  with `--auto-submit-with-profile preview` so EAS submits the binaries
  produced by that build. `release` does the same for production. Store,
  Expo, Apple, and Google credentials stay outside git and come from
  the authenticated local tools or environment variables. The first
  Play metadata upload may require an existing release on the target
  track; if `supply` reports an empty track, run the EAS submit lane
  once for that track and re-run the metadata lane.
- **Docs site**: Vercel (or Cloudflare Pages — TBD in P0).

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
`EXPO_PUBLIC_*` (consumed by the marketing site / mobile app at build,
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
  ↳ Neon branch pr-<n> (pr-preview.yml: neon-create)
  ↳ Fly app harpa-pro-api-pr-<n> created/deployed (pr-preview.yml: fly-preview)
    ↳ release_command applies migrations to pr-<n>
    ↳ /readyz verified
    ↳ sticky PR comment with preview URL
  ↳ marketing preview deploy to CF Pages (marketing-preview.yml)
  ↳ EAS Update → `development` channel, pinned to PR API (mobile-ota-pr.yml)
    ↳ bundle's `EXPO_PUBLIC_API_URL` is `harpa-pro-api-pr-<n>.fly.dev`
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
  ↳ marketing deploy to CF Pages dev branch (marketing-dev.yml)
  ↳ EAS Update → `preview` channel (mobile-ota-dev.yml)
  ↳ release patch commit + tag added to `dev` (version-bump-dev.yml)
  ↳ Fastlane `beta` (manual): metadata -> EAS preview build --auto-submit

Push to main (production)
  ↳ migrations applied to Neon `main`
  ↳ Fly deploy → harpa-pro-api (api-prod.yml)
  ↳ marketing deploy to CF Pages production (marketing-prod.yml)
  ↳ EAS Update → `production` channel (mobile-ota-prod.yml)
  ↳ Fastlane `release` (manual approve): metadata -> EAS production build --auto-submit
```

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
  WAITLIST_CORS_ORIGINS="https://dev.harpa-pro.pages.dev" \
  TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_VERIFY_SID=... \
  R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
  R2_BUCKET=harpa-pro-dev \
  AI_LIVE=1 OPENAI_API_KEY=sk-... GROQ_API_KEY=gsk-... # AI providers
```

After bootstrap, every push to `dev` re-uses the same Neon branch
and Fly app — the workflow only runs pending migrations and ships
new code.

`version-bump-dev.yml` creates the release patch commit and tag on
`dev` after merge commits land. That commit intentionally does **not**
use `[skip ci]`; otherwise a later `dev → main` promotion PR can end up
with a CI-skipped head commit and no required checks. The workflow avoids
recursive bumps with a job-level guard that skips commits whose message
starts with `chore(release): v`.

## Scaling

The API is sized to **avoid cold starts on the first user request**
and **absorb spikes** without operator intervention. Tuning lives
in [`infra/fly/fly.toml`](../../infra/fly/fly.toml).

### Cold starts

| Lever | Prod | Dev |
|---|---|---|
| `auto_stop_machines` | `"suspend"` | `"suspend"` |
| `min_machines_running` | `2` | `0` |
| Effect on first request | warm (~5ms) | cold-resume (~300-500ms) |

`"suspend"` keeps the machine's memory snapshot on disk so resume is
sub-second; `"stop"` would re-boot the container (~3-5s) and re-run
the readiness probe (+1-2s extra latency until first request).

Prod runs **two** machines at all times — one absorbs traffic if the
other is restarting or being replaced by a deploy. Single-machine
prod was the v3 mistake: any restart = a real user saw a connection
error. Cost delta: ~$3.80/mo for the extra `shared-cpu-1x` machine.

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

Steady-state Fly will keep `min_machines_running` (2) hot and let
the rest stop/suspend when traffic recedes.

### Multi-region (future)

`primary_region = "fra"` today. Adding read-replica regions is a
single-step `fly regions add` once the user base demands it — Neon
read replicas exist in multiple regions and the API has no
sticky-session state. Not configured today; flag for P5+.

### Neon connection pooling

Spike traffic × `min_machines_running` × `pg.Pool.max` can quickly
exceed Neon's per-compute connection limit. Two safety nets:

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
