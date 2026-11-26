# @harpa/site

Astro 7 + Tailwind v4 public site for `harpapro.com`, covering interior
procurement and the site-reporting app.

See [`docs/marketing/`](../../docs/marketing/) for current architecture and
historical M0–M4 plans.

## Procurement guides

The existing buying guide and country sections live at
`/procurement/how-to-buy-from-china`. Additional articles are
MDX files in `src/content/procurement/guides/`, with `title`, `description`,
and a positive integer `order` in frontmatter. Each filename becomes its
`/procurement/<filename>` URL and is listed automatically at
`/procurement/guides` and in the sitemap. Use lowercase, hyphenated filenames;
`guides` and `how-to-buy-from-china` are reserved.

Give an article its own image with optional `hero` frontmatter containing
`image` (a path relative to the MDX file), descriptive `alt`, and a visible
`caption`. All three fields are required when `hero` is present. These
generated illustrations use alt text beginning `Generated illustration of `
and a caption beginning `Generated illustration · `. Astro
uses that image for the responsive hero, social preview, and Article metadata.
See the [article image design](../../docs/v4/design-procurement-article-images.md).

Use optional `thumbnail` frontmatter with the same `image`, `alt`, and `caption`
fields for a square index image. Show a recognizable procurement activity,
readable at 80–160px, with varied settings, crops, lighting, and colour across
the series. Keep one dominant subject and a few context cues rather than
repeating isolated studio objects. The index falls back to `hero` when no
thumbnail is supplied; article heroes and social images always use `hero`.
Save generation prompts alongside assets in `*.generation.json`. See the
[index image design](../../docs/v4/design-procurement-guide-index-images.md).

Add each article and its downloads in a separate PR. Draft PRs provide the
editorial review gate; merging content adds it to the static site. Downloads
belong in `public/downloads/procurement/`. Link only to existing pages and
keep country requirements in the main buying guide. See the
[series design](../../docs/v4/design-procurement-article-series.md).

## Product organization

| Scope | Canonical routes | Source ownership beneath `src/` |
| --- | --- | --- |
| Procurement | `/`, `/procurement/how-to-buy-from-china` | `components/procurement`, `content/procurement`, `assets/procurement` |
| Site reporting app | `/reports`, `/reports/docs`, `/reports/roadmap`, `/reports/account-deletion` | `pages/reports`, `components/reports`, `content/reports`, `lib/reports`, `layouts/reports`, `assets/reports` |
| Shared website | `/privacy`, branded 404 | `components/site`, base layout, primitives, analytics, legal helpers |

The procurement homepage remains `/`; `/procurement` is its permanent alias.
Privacy covers both the website and app. The app updates confirmation page
lives at `/reports/confirm` and is excluded from search. Its result is
announced through a `role="status"` region. Failed or expired links point to
`/reports`, the App Store, and support email because no page has a signup form.
App content
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

The shared header (`src/components/site/Header.astro`) uses `<details>` menus
that work without JavaScript. With JavaScript, desktop mega menus open on hover
for fine pointers and stay open when the hovered summary is clicked; Enter and
Space still toggle them. The mobile menu closes on Escape (focus returns to the
toggle), an outside tap, or a link tap, and it locks page scroll while open. It
has the same Contact Us and Get the App actions as desktop.

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

Accessibility baseline: `Layout.astro` renders a "Skip to content" link as the
first focusable element, so every page's `<main>` must have
`id="main-content"`. Put text on `bg-accent-ink`, not `bg-accent` (the vivid
accent fails WCAG AA with cream text). Give interactive elements the
`ring-focus` utility, and keep decorative demo controls out of the tab order.
`tests/a11y.spec.ts` covers these rules.

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

## Images

- Give every `<Image>` `widths`/`sizes` that match its rendered box; don't
  oversize `sizes` to cover a CSS zoom. If only part of a source is shown,
  commit a pre-cropped derivative (Astro's sharp service cannot extract a
  region). The SW-011 product example is cropped from
  `rongshuo-shower-p02.webp`; the extract parameters are in
  `ProcurementEvidence.astro`.
- Lightboxes (docs screenshots and evidence documents) never link the original
  source file. `src/lib/lightbox-image.ts` emits a WebP derivative capped at
  1800px. Dialogs first show the loaded thumbnail, then swap in the full view
  after it decodes.
- Only above-the-fold media (page heroes and the first index or montage
  image) use `priority` or `loading="eager"`; everything else is lazy.

Legacy `/guides/*` URLs and slugs from the first unified-site revision are
preserved in `public/_redirects`. `test:redirects` checks every exact mapping,
trailing slashes, query preservation, and wildcard guide routes through the
local Cloudflare Pages runtime; Astro preview does not apply `_redirects`.

## Search discoverability

Pages ship complete HTML, production canonicals, search/social metadata, and
JSON-LD. The homepage identifies the interior procurement service in China;
`/reports` identifies the iOS construction reporting app (`MobileApplication`)
and mirrors its visible FAQ as `FAQPage` data from the `reportsFaq` collection.
Guides include article and breadcrumb data. Every page must pass its own title
and description to `Layout`. Reporting pages use the app card
(`public/og-image.png`, see `src/lib/social-images.ts`); procurement pages
generate a 1200×630 card from interior imagery. `robots.txt` allows search
crawlers, including AI search, and the sitemap lists every indexable public
page. Confirmation and error pages use
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
