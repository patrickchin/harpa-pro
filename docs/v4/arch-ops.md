# Observability + Ops

## Hosting

- **API**: Fly.io. Single app `harpa-api`, two environments
  (`prod`, `staging`), per-PR ephemeral preview machines.
- **Database**: Neon (managed). See [arch-database.md](arch-database.md).
- **Storage**: Cloudflare R2. See [arch-storage.md](arch-storage.md).
- **Mobile**: EAS Build + EAS Update for OTA. TestFlight + Play
  internal track for distribution.
- **Docs site**: Vercel (or Cloudflare Pages — TBD in P0).

## Public domain layout (`harpapro.com`)

| Subdomain | Service | Host |
|---|---|---|
| `harpapro.com` / `www.harpapro.com` | Marketing site | Vercel / Cloudflare Pages (TBD in `docs/marketing/plan-m0`) |
| `app.harpapro.com` | Web build of the mobile app (if/when shipped) | TBD; same host as marketing is fine |
| `docs.harpapro.com` | `apps/docs` | Vercel |
| `api.harpapro.com` | `packages/api` | **Fly.io** (this doc) |

API path conventions on `api.harpapro.com`:

- `/v1/...` — all versioned business routes. (Current code mounts
  routes at `/`; the `/v1` rebase is planned for P4 — see task
  below.)
- `/healthz` — unversioned. Fly health checks hit this.
- `/openapi.json` — unversioned. SDK generators consume this.

### P4 task: cut over to `api.harpapro.com/v1/`

1. In `packages/api/src/app.ts`, mount every business router under
   a new `app.route('/v1', router)` parent and leave `/healthz` +
   `/openapi.json` at the root.
2. Update `packages/api-contract/openapi.ts` so every path is
   prefixed `/v1`. Re-run `pnpm gen:types` and the spec-drift gate.
3. Update every `request('/projects', …)` style call in
   `apps/mobile/lib/api/client.ts` callers — or simpler, prefix
   inside `request()` itself and keep call sites unchanged.
4. Set `EXPO_PUBLIC_API_URL=https://api.harpapro.com` for prod EAS
   builds (no trailing `/v1`; the client adds it).
5. `fly certs add api.harpapro.com -a harpa-api`, add the `A` /
   `AAAA` records Fly prints, wait for cert issuance.

DNS notes:

- `api.harpapro.com` is a subdomain — `CNAME api → harpa-api.fly.dev`
  works, or use the `A`/`AAAA` records `fly ips list` returns.
- If using Cloudflare DNS, set the `api` record to **DNS-only**
  (grey cloud) so Fly can terminate TLS itself. Re-enable proxy
  later only with CF Full (strict).
- Apex `harpapro.com` cannot CNAME — use Cloudflare CNAME
  flattening or the apex `A` records the marketing host provides.

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
  ↳ Maestro behaviour flows run against the preview API

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
