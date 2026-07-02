# @harpa/site

Astro 5 + Tailwind v4 public site for `harpapro.com`, including marketing,
legal, roadmap, and product-guide routes.

See [`docs/marketing/`](../../docs/marketing/) for the full plan
(M0 → M3) and architecture.

## Develop

```bash
pnpm --filter @harpa/site dev      # http://localhost:3002
pnpm --filter @harpa/site build
pnpm --filter @harpa/site typecheck
pnpm --filter @harpa/site test:e2e
```

## Stack

- Astro 5 (static output, no SSR adapter)
- Tailwind v4 via `@tailwindcss/vite`
- React 19 islands (added in M1/M2)
- MDX content collections (added in M0.4)
- Typed product guides under `/docs`
- Playwright coverage for docs navigation, search, links, and mobile layout
- Deployed to Cloudflare Pages by uploading `dist/` directly via
  `wrangler pages deploy` (the `@astrojs/cloudflare` adapter is
  intentionally not installed — it's only required for SSR routes).

Hard rules: no JS unless an island needs it; no analytics with
cookies pre-consent; Lighthouse performance/accessibility ≥ 90 and best
practices/SEO ≥ 95.
