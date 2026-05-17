# Observability + Ops

## Hosting

- **API**: Fly.io. Two apps:
  - `harpa-pro-api` (prod) at `https://api.harpapro.com` — deployed on
    push to `main` by `.github/workflows/api-prod.yml`.
  - `harpa-pro-api-dev` (dev) at `https://harpa-pro-api-dev.fly.dev` —
    deployed on push to `dev` by `.github/workflows/api-dev.yml`.
    Sleeps when idle (`min_machines_running = 0`) to save cost.
  Per-PR ephemeral preview machines (planned).
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
- **Mobile**: EAS Build + EAS Update for OTA. TestFlight + Play
  internal track for distribution. Three build profiles in
  `apps/mobile/eas.json`:
  - `production` — App Store / Play. `com.harpa.pro` →
    `https://api.harpapro.com`.
  - `preview` — internal / TestFlight. `com.harpa.pro.dev` →
    `https://harpa-pro-api-dev.fly.dev`. Installable side-by-side
    with prod so QA can carry both apps.
  - `development` — Metro dev-client. `com.harpa.pro.dev` →
    `http://localhost:8787`.
  Non-prod variants expose a dev screen (`/(dev)/api-base-url`) that
  overrides the API base URL at runtime — flip QA between dev / a
  PR-preview Fly app without a rebuild. Override is hard-disabled in
  production builds (see `lib/api/base-url.ts`).
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

# Bootstrap Fly secrets from Doppler:
pnpm secrets:fly:dev     # → harpa-pro-api-dev
pnpm secrets:fly:prod    # → harpa-pro-api
```

The repo is linked with `doppler setup --project harpa-pro --config dev`
(stored in `~/.doppler/.doppler.yaml`). New developers run this once
after cloning + `doppler login`.

### CI

GitHub Actions still reads from individual `secrets.*`. Long-term we
should switch CI to a Doppler service token (`DOPPLER_TOKEN`) +
`doppler run -- …` so the GitHub secret list shrinks to a single
entry per env. Tracked under p41.

- `.env.example` at the repo root enumerates every
  `EXPO_PUBLIC_*` var. The `lib/env.ts` Zod parse runs in CI
  against a populated `.env.example` to catch missing entries
  before merge.

## Observability

- **Sentry** for crashes, both mobile and API. Same project,
  different DSNs. Wired in P4.
- **Fly metrics** — built-in for API latency / 5xx rate.
- **Logs** — Fly log shipping to Better Stack (free tier) for
  search.
- **Request id** — every API request gets `X-Request-Id` echoed
  in responses; logged with the structured log entry; mobile
  attaches it to Sentry breadcrumbs on error.

## Deploy flow

```
PR open
  ↳ Neon branch pr-<n> (pr-preview.yml)
  ↳ migrations applied to pr-<n>
  ↳ marketing preview deploy to CF Pages (marketing-preview.yml)
  ↳ EAS preview build (manual trigger — planned)

Push to dev
  ↳ Neon `dev` branch ensured (idempotent, long-lived)
  ↳ migrations applied to `dev`
  ↳ Fly deploy → harpa-pro-api-dev (api-dev.yml)
  ↳ marketing deploy to CF Pages dev branch (marketing-dev.yml)
  ↳ EAS staging build (TestFlight internal — planned)

Push to main (production)
  ↳ migrations applied to Neon `main`
  ↳ Fly deploy → harpa-pro-api (api-prod.yml)
  ↳ marketing deploy to CF Pages production (marketing-prod.yml)
  ↳ EAS production build (manual approve — planned)
  ↳ EAS Update for JS-only patches
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
  OPENAI_API_KEY=... ANTHROPIC_API_KEY=... # etc.
```

After bootstrap, every push to `dev` re-uses the same Neon branch
and Fly app — the workflow only runs pending migrations and ships
new code.

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
