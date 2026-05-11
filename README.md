# harpa-pro

Mobile-first construction site reporting app. Voice/photo notes, AI-summarised
daily reports, PDF export, project + team management.

This repo is a **fresh rewrite (v4)** — see [`AGENTS.md`](AGENTS.md) for the
stack, hard rules, and conventions, and [`docs/v4/`](docs/v4/) for the
architecture and phased plan.

## Quick start

```bash
pnpm install
pnpm dev          # turbo dev — API + mobile + docs
pnpm test         # full unit/integration suite
```

(Wire-up happens in P0 — see [`docs/v4/plan-p0-foundation.md`](docs/v4/plan-p0-foundation.md).)

## Layout

```
apps/
  mobile/          # Expo + NativeWind app
  docs/            # in-app guides + visual reference (Next.js)
packages/
  api/             # Hono REST API (Fly.io)
  api-contract/    # Zod schemas + generated OpenAPI types
  ai-fixtures/     # record/replay layer for every LLM call
  ui/              # shared NativeWind primitives (optional, P2)
infra/
  neon/            # Neon branching scripts
  fly/             # Fly.io deployment config
docs/
  v4/              # current architecture + plans
  legacy-v3/       # preserved v3 attempt (reference only)
skills/            # auto-loaded coding skills
```

## Status

P0 — scaffolding. See [`docs/v4/implementation-plan.md`](docs/v4/implementation-plan.md).
