# @harpa/marketing

Astro 5 + Tailwind v4 marketing site for `harpapro.com`.

See [`docs/marketing/`](../../docs/marketing/) for the full plan
(M0 → M3) and architecture.

## Develop

```bash
pnpm --filter @harpa/marketing dev      # http://localhost:3002
pnpm --filter @harpa/marketing build
pnpm --filter @harpa/marketing typecheck
```

## Stack

- Astro 5 (static output, no SSR adapter)
- Tailwind v4 via `@tailwindcss/vite`
- React 19 islands (added in M1/M2)
- MDX content collections (added in M0.4)
- Deployed to Cloudflare Pages by uploading `dist/` directly via
  `wrangler pages deploy` (the `@astrojs/cloudflare` adapter is
  intentionally not installed — it's only required for SSR routes).

Hard rules: no JS unless an island needs it; no analytics with
cookies pre-consent; Lighthouse ≥ 95 across the board.
