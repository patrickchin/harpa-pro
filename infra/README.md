# Infra

| Dir | Purpose |
|---|---|
| `neon/` | Neon branching API client used by CI for per-PR DB branches. |
| `fly/` | Fly.io app config (`fly.toml`), Dockerfile, deploy script for `@harpa/api`. |
| `r2/` | Cloudflare R2 bucket bootstrap (idempotent). |

All scripts are dependency-free `tsx` entry points so CI can run them
without installing per-tool SDKs. Real deployment is wired through the
CI workflows in `.github/workflows/` (P0.10).
