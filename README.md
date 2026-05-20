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

## CLI

`apps/cli` (`@harpa/cli`) is the debug / LLM-driven CLI that talks
to the API. All 37 routes are covered. Set `HARPA_API_URL` and
(after `harpa auth otp verify`) `HARPA_TOKEN`, then:

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

Prefer an interactive menu? Run `pnpm harpa tui` to launch a guided
shell with phone+OTP sign-in and persisted credentials (per-OS config
dir, file mode `0600`). See
[`docs/v4/arch-tui-app.md`](docs/v4/arch-tui-app.md).

> **Runtime note:** `apps/cli` runs on [Bun](https://bun.sh) (≥ 1.3) so it
> can host the OpenTUI rendering layer (see
> [`docs/v4/arch-tui-layout.md`](docs/v4/arch-tui-layout.md)). For local
> development install Bun with `brew install oven-sh/bun/bun` or
> `curl -fsSL https://bun.sh/install | bash`. The rest of the monorepo
> (api, mobile, packages) stays on Node + pnpm; only the CLI workspace
> requires Bun.
>
> **End users** can download a single-file `harpa` binary (no Bun
> install required) from the [Releases page](https://github.com/patrickchin/harpa-pro/releases)
> — pick `harpa-{linux,darwin}-{x64,arm64}`, `chmod +x`, drop on
> `$PATH`. Released by pushing a `cli-v*` tag (see
> `.github/workflows/cli-release.yml`).

(Wire-up happens in P0 — see [`docs/v4/plan-p0-foundation.md`](docs/v4/plan-p0-foundation.md).)

## Layout

```
apps/
  mobile/          # Expo + NativeWind app
  docs/            # in-app guides + visual reference (Next.js)
  cli/             # @harpa/cli — debug / LLM-driven CLI
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
