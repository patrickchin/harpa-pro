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

## Search discoverability

Pages ship complete HTML, production canonicals, search/social metadata, and
JSON-LD. The homepage identifies the interior procurement service in China;
`/app` identifies the iOS construction reporting app. Guides include article
and breadcrumb data. `robots.txt` allows search crawlers, including AI search,
and the sitemap lists public pages. Confirmation and error pages use
`noindex`; the production Pages alias has a hostname-specific `noindex`
header. Cloudflare supplies `noindex` for dev/preview deployments.

The procurement homepage answers service, product-scope, inspection, and
project-brief questions in visible HTML. The reporting app's audience,
workflow, and initial voice demonstration also render before JavaScript.

The old `docs.harpapro.com` Vercel deployment still serves obsolete guides as
of 2026-10-10. Its hostname cutover to the current `/docs` guides remains a
separate infrastructure step; redirects in this app cannot affect Vercel.

Run `pnpm --filter @harpa/site exec playwright test tests/seo.spec.ts` to verify built
metadata, crawlable content without JavaScript, sitemap coverage, and crawler
access. Preview checks cannot verify Cloudflare's live bot/security policy.
After deployment, submit `/sitemap.xml` in Google Search Console and Bing
Webmaster Tools, inspect key URLs, and confirm official search crawlers can
reach the production site without challenges. Indexing and AI citations
depend on those external services.

See the [search design](../../docs/v4/design-site-search-discoverability.md)
for scope, verification, and release steps.
