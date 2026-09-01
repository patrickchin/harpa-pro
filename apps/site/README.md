# @harpa/site

Astro 7 + Tailwind v4 public site for `harpapro.com`, including marketing,
privacy, roadmap, and product-guide routes.

See [`docs/marketing/`](../../docs/marketing/) for current architecture and
historical M0–M4 plans.

## Develop

```bash
pnpm --filter @harpa/site dev      # http://localhost:3002
pnpm --filter @harpa/site build
pnpm --filter @harpa/site typecheck
pnpm --filter @harpa/site test:e2e
```

Copy `.env.example` to `.env` before local development.
`PUBLIC_DASHBOARD_URL` remains reserved for a later public-dashboard launch;
the current shared header does not expose the dashboard.

## Stack

- Astro 7 with Vite 8 (static output, no SSR adapter; Node 22.12+)
- Tailwind v4 via `@tailwindcss/vite`
- React 19 islands (added in M1/M2)
- MDX content collections (added in M0.4)
- Typed product guides under `/docs`
- Chromium and Firefox Playwright coverage for docs navigation, search, links,
  and responsive layout
- Deployed from Git by the `harpa-pro` Cloudflare Pages project. Cloudflare
  runs `scripts/ci/build-cloudflare-pages.sh site`; the
  `@astrojs/cloudflare` adapter is intentionally not installed because every
  route is static.

Hard rules: no JS unless an island needs it; no analytics with
cookies pre-consent; Lighthouse performance/accessibility ≥ 90 and best
practices/SEO ≥ 95.

## Product guides

`/docs` uses a task-first structure designed to keep new users focused:

- two core workflows: generating an AI report and exporting/sharing a PDF;
- five short everyday-task guides; and
- two setup/account guides.

Guide content lives in `src/content/docs/`. Current mobile screenshots are
copied from `apps/mobile/fastlane/screenshots/en-US/` into
`src/assets/docs/`, then Astro emits responsive WebP variants during the static
build. `docs-content.test.ts` requires those checked-in copies to match the
release captures exactly.

Legacy `/guides/*` URLs and slugs from the first unified-site revision are
preserved in `public/_redirects`.
