# Observability + Ops

## Hosting

- **API**: Fly.io. Single app `harpa-api`, two environments
  (`prod`, `staging`), per-PR ephemeral preview machines.
- **Database**: Neon (managed). See [arch-database.md](arch-database.md).
- **Storage**: Cloudflare R2. See [arch-storage.md](arch-storage.md).
- **Mobile**: EAS Build + EAS Update for OTA. TestFlight + Play
  internal track for distribution.
- **Docs site**: Vercel (or Cloudflare Pages — TBD in P0).

## Secrets

- `infra/fly/secrets.example` enumerates every secret the API
  needs. CI fails if a deploy is missing one.
- Local dev secrets via Doppler (config: `dev`).
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
  ↳ Neon branch pr-<n>
  ↳ Fly preview machine deploys api with NEON_BRANCH=pr-<n>
  ↳ EAS preview build (manual trigger)
  ↳ Maestro + visual gate runs against the preview API

Merge to dev
  ↳ Neon migrations applied to `dev` branch
  ↳ Fly staging deploy
  ↳ EAS staging build (TestFlight internal)

Merge to main (release)
  ↳ Neon migrations applied to `prod`
  ↳ Fly production deploy (rolling)
  ↳ EAS production build (manual approve)
  ↳ EAS Update for JS-only patches
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
