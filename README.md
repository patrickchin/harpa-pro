# harpa-pro

Harpa Pro is a construction-site reporting product with a mobile capture app
and an office dashboard. It supports voice and photo notes, AI-generated daily
reports, PDF export, and project teams.

This repository contains the current v4 application. See
[`AGENTS.md`](AGENTS.md) for project rules and
[`docs/v4/architecture.md`](docs/v4/architecture.md) for the system index.

## Quick start

```bash
nvm install       # reads the exact release from .nvmrc
nvm use
corepack enable
pnpm install
pnpm dev                              # workspaces with a dev script
pnpm --filter @harpa/mobile start     # Expo dev-client server
pnpm --filter @harpa/dashboard dev    # office dashboard on port 3003
pnpm test                             # workspace unit tests
```

`pnpm dev` does not start the mobile workspace. API and CLI integration tests
also run separately because they start Postgres containers:

```bash
pnpm test:api:integration
pnpm --filter @harpa/cli test:integration
```

Use [`.env.example`](.env.example) for local configuration. The Docker Compose
stack also requires a `TEST_ACCOUNT_PASSWORD` of at least 16 characters.

## CLI

`apps/cli` (`@harpa/cli`) is the debug and automation client for supported API
routes. Set `HARPA_API_URL`, then sign in with email OTP:

```bash
export HARPA_API_URL=http://localhost:8787
pnpm harpa auth otp start user@example.com
OTP_CODE=123456 # Replace with the code from the email.
export HARPA_TOKEN="$(pnpm harpa auth otp verify user@example.com "$OTP_CODE" --raw)"
pnpm harpa me get
pnpm harpa projects list
pnpm harpa reports generate <projectSlug> <reportNumber>
pnpm harpa files upload --file ./photo.jpg --kind image
```

`--json` writes the API response to stdout. `--verbose` writes available
request and rate-limit metadata to stderr. See
[`apps/cli/README.md`](apps/cli/README.md).

## Layout

```
apps/
  mobile/          # Expo + NativeWind app
  dashboard/       # React + Vite office project/report workspace
  admin/           # Astro administration console
  site/            # Astro marketing and public documentation site
  cli/             # @harpa/cli — debug / LLM-driven CLI
packages/
  api/             # Hono REST API (Fly.io)
  api-contract/    # Zod schemas + generated OpenAPI types
  ai-fixtures/     # record/replay layer for every LLM call
  design-tokens/   # mobile-authored CSS tokens for the dashboard
infra/
  neon/            # Neon branching scripts
  fly/             # Fly.io deployment config
  r2/              # Cloudflare R2 bucket setup
docs/
  v4/              # current architecture + plans
  bugs/            # recurring bug log
  marketing/       # marketing site plans + ops
  superpowers/     # specs + plans for individual features
skills/            # auto-loaded coding skills
```

## Status

The repository version is `0.1.65`. The mobile, API, public-site, and admin
production surfaces exist. The office dashboard is active for previews and
development; automatic production builds and `app.harpapro.com` remain pending
separate approval. Treat phase documents as implementation records, not as a
live deployment dashboard. Use
[`CHANGELOG.md`](CHANGELOG.md), current CI, and deployment health checks for a
release decision.
