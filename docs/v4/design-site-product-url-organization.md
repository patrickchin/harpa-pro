# Public-site product URLs and source organization

## Context

Harpa Pro now presents two offerings: interior procurement and the site
reporting app. The public navigation already groups those offerings, but
`/docs`, `/roadmap`, and `/account-deletion` still look like site-wide
resources. Their content belongs exclusively to the app. Source directories
also retain names from the app-only landing page and the former agents page.

This decision refines [product navigation](design-public-site-product-navigation.md),
[homepage hero and navigation](design-site-hero-navigation.md), and
[public documentation](design-public-site-docs.md). Their existing content,
visual design, interaction, and accessibility requirements remain the
baseline. The organization change does not redesign the homepage.

## Decision

Use `/reports` for the site reporting product, as chosen by the user. Put
its app resources beneath that namespace and the procurement buying guide
beneath `/procurement`. The procurement homepage remains `/`, as
established by the current product-navigation design. `/procurement` remains a permanent alias to that homepage.

| Resource | Canonical route |
| --- | --- |
| Procurement overview | `/` |
| Procurement buying guide | `/procurement/how-to-buy-from-china` |
| Site reporting app overview | `/reports` |
| App guides index | `/reports/docs` |
| App task guide | `/reports/docs/guides/<slug>` |
| App roadmap | `/reports/roadmap` |
| App account deletion | `/reports/account-deletion` |
| App updates confirmation | `/reports/confirm` |
| Shared privacy notice | `/privacy` |

The public labels continue to say **Procurement**, **Site Reporting**,
**Guides**, and **Roadmap**. The app overview and documentation explicitly
identify the Harpa Pro app. URLs provide scope without adding technical
language to navigation.

`/privacy` stays global because its current notice covers both the website
(including contact analytics) and the mobile application. Keep mobile
profile and App Store privacy links pointed at it. Account deletion covers
app accounts and data, so it moves under `/reports`. Confirmation belongs to
the app updates subscription; its success and retry links return to
`/reports`. The current reporting page has no signup form or `#updates`
anchor, so confirmation copy must not promise either one.

The `app.harpapro.com` dashboard, mobile routing, API route names, monorepo
workspaces, and deployment project names do not change. App Store domain
paths also stay unchanged. `/reports` is the public product page; the
dashboard retains its existing URL. No new deployment or package boundary
is needed.

## Source ownership

Keep one Astro application at `apps/site`. Organize its current files by
their actual consumers, using normal directories and imports:

| Current source | Destination |
| --- | --- |
| `src/pages/app.astro` | `src/pages/reports/index.astro` |
| `src/pages/docs/` | `src/pages/reports/docs/` |
| `src/pages/roadmap.astro` | `src/pages/reports/roadmap.astro` |
| `src/pages/account-deletion.astro` | `src/pages/reports/account-deletion.astro` |
| `src/pages/confirm.astro` | `src/pages/reports/confirm.astro` |
| `src/pages/how-to-buy-from-china.astro` | `src/pages/procurement/how-to-buy-from-china.astro` |
| `src/components/landing/{Header,Footer,Wordmark}.astro` | `src/components/site/` |
| Remaining `src/components/landing/` files | `src/components/reports/` |
| `src/components/{VoiceDemo,VoiceReportPreview}*` | `src/components/reports/` |
| `src/components/docs/` | `src/components/reports/docs/` |
| `src/components/agents/` | `src/components/procurement/` |
| `src/layouts/DocsLayout.astro` | `src/layouts/reports/DocsLayout.astro` |
| `src/content/{docs,features,faq,roadmap}/` | Matching directories beneath `src/content/reports/` |
| `src/content/articles/how-to-buy-from-china.mdx` | `src/content/procurement/how-to-buy-from-china.mdx` |
| `src/lib/docs*` | Matching files beneath `src/lib/reports/` |
| `src/lib/links.ts` | `src/lib/reports/links.ts` |
| `src/fixtures/demoReport.ts` | `src/fixtures/reports/demoReport.ts` |
| `src/assets/docs/` | `src/assets/reports/docs/` |
| `src/assets/agents/finishes/` | `src/assets/procurement/finishes/` |
| `src/assets/agents/procurement/` | `src/assets/procurement/evidence/` |
| Other `src/assets/agents/` images | `src/assets/procurement/` |

Move colocated tests with their source and update import paths. Existing
`src/assets/procurement/factories/` stays in place. Team portraits may stay
in `src/assets/team/` because they describe the company. Shared primitives,
`Icon`, the base layout, environment configuration, analytics, and legal
helpers remain shared. Do not split global CSS during this routing change.

Scope the Astro content collection names to `reportsDocs`, `reportsFeatures`,
`reportsFaq`, and `reportsRoadmap`, and point their loaders at the matching
reporting directories. Update `getCollection`, `CollectionEntry`, MDX component
imports, screenshot registries, source-contract tests, and search types
together. Guide filenames, derived slugs, tier order, image bytes, and
content validation stay the same.

Move `src/lib/links.ts` to `src/lib/reports/links.ts`; it continues to own
only the App Store URL constant. Keep guide URL construction in the existing
docs helper under `src/lib/reports/`. Avoid introducing a central route
registry, route framework, product registry, compatibility pages, or another
shared package.

## Links and metadata

Update header and footer links, app page resource cards, guide navigation,
search results, related guides, previous/next links, breadcrumbs, legal
links, 404 destinations, and any MDX links to canonical destinations.
Procurement navigation retains its current overview, products-and-factories
and process fragments, and buying guide. Its footer retains the current
fragments and evidence links; only the buying-guide path changes.

Astro emits `build.format: file` with `trailingSlash: never`, matching the
canonical URLs and avoiding Cloudflare directory-slash redirects after the
legacy 301.

The sitemap lists only canonical routes. It excludes the confirmation page
and aliases. Canonical tags, Open Graph URLs, JSON-LD page IDs, article URLs,
and breadcrumb URLs must use the new routes, without queries or trailing
slashes. The app remains a `SoftwareApplication`; guides retain their
`CollectionPage` / `TechArticle` types. The buying guide remains an article.

The guide's production canonical becomes
`https://harpapro.com/procurement/how-to-buy-from-china`. App guide
canonicals become `https://harpapro.com/reports/docs/guides/<slug>`.

## Compatibility

Implement permanent 301 redirects in `public/_redirects`. Keep legacy URLs
working without rendering duplicate HTML pages:

| Old route | Destination |
| --- | --- |
| `/app` and `/app/` | `/reports` |
| `/docs` | `/reports/docs` |
| `/docs/guides/<current-slug>` | `/reports/docs/guides/<current-slug>` |
| `/roadmap` | `/reports/roadmap` |
| `/account-deletion` | `/reports/account-deletion` |
| `/confirm` | `/reports/confirm` |
| `/how-to-buy-from-china` | `/procurement/how-to-buy-from-china` |
| `/guides/<known-slug>` | Corresponding `/reports/docs/guides/<slug>` |
| `/search` | `/reports/docs` |
| First-revision docs slugs | Their final `/reports/docs/guides/<slug>` |

Retain `/procurement` and `/procurement/` → `/`, and the existing removed
procurement document redirects to `/#evidence`. Explicit mappings for
renamed first-revision slugs precede broad docs compatibility mappings.
Legacy mappings should point directly to final destinations, with no
redirect through `/docs`. Ensure trailing-slash forms also resolve and
unknown guide paths finish at the useful 404 page.

Confirmation redirects must preserve `?token=…`. Existing bookmarked guide
fragments and procurement article fragments must still find the same IDs.
Verify redirects through a server that applies Cloudflare Pages rules;
Astro's preview server alone does not prove their behavior.

All current app documentation is served by this site at `/reports/docs`.
A separate docs hostname or deployment is not part of this architecture or
a prerequisite for releasing these routes. Remove obsolete hostname-cutover
instructions from the current notes. Keep old path redirects in this app
for existing links.

## Other consumers and documentation

Update current operational references and active source-path pointers:

- `apps/site/README.md` and `docs/marketing/README.md`: current product map,
  app guide source path, shared privacy scope, and compatibility policy.
- `docs/v4/arch-ops.md`: canonical public-site topology and account-deletion
  URL recommended for the Play listing. Existing store URLs remain valid
  through permanent redirects.
- `docs/marketing/deploy-cloudflare-pages.md`: canonical documentation paths,
  expected redirect destinations, and normal Git deployment verification.
- `.github/agents/doc-updater.agent.md`: app guide content location.
- `.github/workflows/site-{dev,preview,prod}.yml`: deployment verifier's
  expected legacy-guide redirect suffix.
- The corresponding verifier fixtures in
  `scripts/ci/__tests__/verify-pages-deployment.test.sh` and
  `scripts/ci/__tests__/pages-verify-server.py`.
- `packages/api/src/env.ts`: default `WAITLIST_CONFIRM_BASE_URL` becomes
  `https://harpapro.com/reports/confirm`. Update configured examples and email
  expectations that represent the public URL. The API endpoint
  `POST /waitlist/confirm` is unchanged.
- iOS Fastlane metadata: app marketing URL uses `/reports` and support URL
  uses `/reports/docs`. The shared privacy URL stays `/privacy`.

Preserve older decision documents and completed phase plans as history. Add
a short pointer to this decision where an earlier specification would
otherwise look current. Avoid blanket replacement of `/docs` across the
repository: repository documentation, API paths, historical examples, and
intentional redirect inputs have different meanings.

## Verification

Run site unit tests, Astro typecheck, lint, and a production build. Run the
existing browser suite against the new canonical pages. Its sitemap crawl
must continue checking every same-origin link, fragment, and asset.

Add focused routing coverage for:

- canonical page responses, sitemap entries, and metadata for both products;
- every legacy redirect's direct destination, including renamed guide
  slugs, trailing-slash forms, query preservation, and existing procurement
  document redirects;
- app guide search, screenshots, previous/next and related links, and
  working navigation without JavaScript;
- desktop/mobile product groups and the shared privacy destination;
- confirmation with a token reaching the existing API endpoint and
  confirmation success and retry links returning to `/reports`, without
  linking to an absent signup form or `#updates` anchor.

Run deployment-verifier tests after updating their redirect expectation.
If the API default changes, run its environment and confirmation-email
checks. Existing integration coverage must still prove the default email
wiring generates and sends a working confirmation URL.

Review procurement and app pages at desktop and mobile widths to confirm
that source moves preserve their appearance and interactions. This task
adds no dependencies, changes no report behavior, and does not deploy or
modify provider consoles by itself.
