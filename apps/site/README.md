# @harpa/site

Astro 7 + Tailwind v4 public site for `harpapro.com`, covering interior
procurement and the site-reporting app.

See [`docs/marketing/`](../../docs/marketing/) for current architecture and
historical M0–M4 plans.

## Product organization

| Scope | Canonical routes | Source ownership beneath `src/` |
| --- | --- | --- |
| Procurement | `/`, `/procurement/how-to-buy-from-china` | `components/procurement`, `content/procurement`, `assets/procurement` |
| Site reporting app | `/reports`, `/reports/docs`, `/reports/roadmap`, `/reports/account-deletion` | `pages/reports`, `components/reports`, `content/reports`, `lib/reports`, `layouts/reports`, `assets/reports` |
| Shared website | `/privacy`, branded 404 | `components/site`, base layout, primitives, analytics, legal helpers |

The procurement homepage remains `/`; `/procurement` is its permanent alias.
Privacy covers both the website and app. The app updates confirmation page
lives at `/reports/confirm` and is excluded from search. App content
collections are `reportsDocs`, `reportsFeatures`, `reportsFaq`, and
`reportsRoadmap`. Mobile, API, and dashboard workspace names are unchanged.

Old `/app`, `/docs`, `/roadmap`, `/account-deletion`, `/confirm`, buying-guide,
and known legacy guide URLs redirect permanently to their final destinations.
Internal links and sitemap entries use canonical URLs. See the
[URL organization design](../../docs/v4/design-site-product-url-organization.md).

## Develop

```bash
pnpm --filter @harpa/site dev      # http://localhost:3002
pnpm --filter @harpa/site build
pnpm --filter @harpa/site typecheck
pnpm --filter @harpa/site test:e2e
pnpm --filter @harpa/site test:redirects # build first; Cloudflare Pages rules
```

Copy `.env.example` to `.env` before local development.
`PUBLIC_DASHBOARD_URL` remains reserved for a later public-dashboard launch;
the current shared header does not expose the dashboard.

## Stack

- Astro 7 with Vite 8 (static output, no SSR adapter; Node 22.12+)
- Tailwind v4 via `@tailwindcss/vite`
- React 19 islands (added in M1/M2)
- MDX content collections (added in M0.4)
- Typed product guides under `/reports/docs`
- Chromium and Firefox Playwright coverage for docs navigation, search, links,
  and responsive layout
- Deployed from Git by the `harpa-pro` Cloudflare Pages project. Cloudflare
  runs `scripts/ci/build-cloudflare-pages.sh site`; the
  `@astrojs/cloudflare` adapter is intentionally not installed because every
  route is static.

Hard rules: JS only for interactions and configured analytics; no analytics with
cookies pre-consent; Lighthouse performance/accessibility ≥ 90 and best
practices/SEO ≥ 95.

## Website analytics

PostHog measures page visits, link/button clicks, and these contact actions:
`contact_whatsapp_clicked`, `contact_email_opened`, and
`contact_email_copied` (only after successful copying). Clicks indicate
contact intent, not a successfully sent message.

Set both variables in the **production** Cloudflare Pages build environment:

- `PUBLIC_POSTHOG_KEY`: the public `phc_…` project token, never a personal key.
- `PUBLIC_POSTHOG_HOST`: `https://eu.i.posthog.com` (chosen EU region).

Leave both unset to disable analytics. Partial or invalid configuration fails
the build. The Cloudflare build script disables analytics on `dev` and PR
branches even if the production variables were accidentally inherited.
Local builds can use a separate test project; never use production tokens
for automated checks.

In the EU PostHog project, enable **Cookieless server hash mode** under
**Project settings → Web analytics**. Without it, PostHog discards these
events. Keep the free plan without a payment card to stop at the free
allowance instead of incurring usage charges. Add the three events above as
conversion goals in PostHog's Web analytics dashboard.

Collection uses no analytics cookies or browser storage, no identified
profiles, and no recordings. Autocapture is limited to clicks, with DOM
text/attributes masked and forms/docs search excluded. URLs lose queries
and fragments; clipboard contents are never collected. The privacy page
discloses this setup. Reconcile the externally hosted Termly policy before
production activation. See the
[analytics design](../../docs/v4/design-public-site-posthog.md).

Run `pnpm --filter @harpa/site test:analytics` for browser checks using the
real SDK, a fake project token, and intercepted ingestion; no test data goes
to PostHog.

## Product guides

`/reports/docs` uses a task-first structure designed to keep new users focused:

- two core workflows: generating an AI report and exporting/sharing a PDF;
- five short everyday-task guides; and
- two setup/account guides.

Guide content lives in `src/content/reports/docs/`. Current mobile screenshots are
copied from `apps/mobile/fastlane/screenshots/en-US/` into
`src/assets/reports/docs/`, then Astro emits responsive WebP variants during the static
build. `docs-content.test.ts` requires those checked-in copies to match the
release captures exactly.

Legacy `/guides/*` URLs and slugs from the first unified-site revision are
preserved in `public/_redirects`. `test:redirects` checks every exact mapping,
trailing slashes, query preservation, and wildcard guide routes through the
local Cloudflare Pages runtime; Astro preview does not apply `_redirects`.

## Search discoverability

Pages ship complete HTML, production canonicals, search/social metadata, and
JSON-LD. The homepage identifies the interior procurement service in China;
`/reports` identifies the iOS construction reporting app. Guides include article
and breadcrumb data. `robots.txt` allows search crawlers, including AI search,
and the sitemap lists public pages. Confirmation and error pages use
`noindex`; the production Pages alias has a hostname-specific `noindex`
header. Cloudflare supplies `noindex` for dev/preview deployments.

The procurement homepage answers service, product-scope, inspection, and
project-brief questions in visible HTML. The reporting app's audience,
workflow, and initial voice demonstration also render before JavaScript.

App documentation is served by this same site at `/reports/docs`. No separate
documentation hostname or deployment is required.

Run `pnpm --filter @harpa/site exec playwright test tests/seo.spec.ts` to verify built
metadata, crawlable content without JavaScript, sitemap coverage, and crawler
access. Preview checks cannot verify Cloudflare's live bot/security policy.
After deployment, submit `/sitemap.xml` in Google Search Console and Bing
Webmaster Tools, inspect key URLs, and confirm official search crawlers can
reach the production site without challenges. Indexing and AI citations
depend on those external services.

See the [search design](../../docs/v4/design-site-search-discoverability.md)
for scope, verification, and release steps.
