# harpa-pro

Mobile-first construction site reporting app. Voice/photo notes, AI-summarised
daily reports, PDF export, project + team management.

This repo is a **fresh rewrite (v4)** — see [`AGENTS.md`](AGENTS.md) for the
stack, hard rules, and conventions, and [`docs/v4/`](docs/v4/) for the
architecture and phased plan.

## Quick start

```bash
nvm install       # reads the exact release from .nvmrc
nvm use
corepack enable
pnpm install
pnpm dev          # turbo dev — API + mobile + docs
pnpm test         # full unit/integration suite
```

## CLI

`apps/cli` (`@harpa/cli`) is the debug / LLM-driven CLI that talks
to the API. Every API route has a CLI command. Set `HARPA_API_URL`
and (after `harpa auth otp verify`) `HARPA_TOKEN`, then:

```bash
pnpm harpa auth otp start +15551234567
pnpm harpa auth otp verify +15551234567 000000 --raw      # prints token
export HARPA_TOKEN=$(pnpm harpa auth otp verify ... --raw)
pnpm harpa me get
pnpm harpa projects list
pnpm harpa reports generate <reportId>
pnpm harpa files upload --file ./photo.jpg --kind image
```

`--json` returns the raw API response; `--verbose` prints headers
and the request ID to stderr. See [`docs/v4/arch-cli.md`](docs/v4/arch-cli.md).

## Layout

```
apps/
  mobile/          # Expo + NativeWind app
  docs/            # in-app guides + visual reference (Next.js)
  marketing/       # Astro marketing site (Cloudflare Pages)
  cli/             # @harpa/cli — debug / LLM-driven CLI
packages/
  api/             # Hono REST API (Fly.io)
  api-contract/    # Zod schemas + generated OpenAPI types
  ai-fixtures/     # record/replay layer for every LLM call
  report-core/     # shared report-body Zod schemas + helpers
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

P0 (Foundation) and P1 (API Core) complete. P2 (Mobile Shell)
shipped (`v0.2.0-shell`). P3 (Feature Build) is the active phase —
see [`docs/v4/implementation-plan.md`](docs/v4/implementation-plan.md)
and the per-phase plans under [`docs/v4/`](docs/v4/).
