# Public site search discoverability

Current URL and source ownership is defined by
[product URL organization](design-site-product-url-organization.md). That
later decision supersedes the route and source paths below; the content and
interaction requirements still apply.


## Purpose

Make the public Harpa Pro site easier for search engines and AI search
systems to identify, crawl, and cite. Improve technical signals and clear
product descriptions while preserving the current procurement homepage,
reporting app page, navigation, and guide workflows.

This implements the user's request to improve website SEO and AI search
discoverability. The site source and the current product guides are the
baseline. Related decisions are in
[`design-public-site-product-navigation.md`](design-public-site-product-navigation.md)
and [`design-site-procurement-team.md`](design-site-procurement-team.md).

## Current evidence

- `apps/site` builds static Astro HTML for `https://harpapro.com`.
- `/` describes luxury interior procurement in China: specifications,
  factory coordination, inspections, shipping, and procurement records.
- `/app` describes construction site reporting from voice, photos, and
  text, with review, editing, finalization, and PDF sharing.
- The reporting app is available from the App Store. Public FAQ and roadmap
  content describe Android, full offline mode, and the office web app as
  planned. Keep those availability distinctions explicit.
- The shared layout already renders unique descriptions, canonical links,
  and Open Graph/Twitter metadata. Sitemap and robots routes exist.
- Guides and FAQ answers are present in initial HTML. The interactive voice
  demo is client-only; important product facts must remain outside it.
- There is no structured data. `/confirm` has no `noindex` directive even
  though it is a token-dependent signup utility excluded from the sitemap.
- Cloudflare Pages normally adds `X-Robots-Tag: noindex` to preview
  deployments. Live inspection confirms this on `dev.harpa-pro.pages.dev`;
  the production alias `harpa-pro.pages.dev` lacks that header.

## Design

### Shared metadata and identity

Keep the existing layout as the metadata boundary. Use the production
origin for canonicals, social URLs, and structured data, even on preview
hosts. Pick one canonical path spelling for every route, including trailing
slash handling, and use it consistently in sitemap and structured data.
Query strings and fragments never enter canonical URLs.

Give the homepage an interior procurement title and description. Give
`/app` a construction daily reporting title and description. Every guide
retains its task-specific title with the Harpa Pro brand. Keep key headings
and concise descriptions in normal HTML; avoid keyword lists, invisible
copy, and pages generated just to capture variations of a query.

The homepage social preview uses a 1200 × 630 PNG derived at build time
from its existing interior photograph. The reporting app keeps its existing
branded social image. Match preview text and images to the page's offer.

Add JSON-LD with stable production `@id` references:

- `Organization` and `WebSite` identify Harpa Pro and its public site.
- A homepage `Service` describes interior procurement in China using the
  visible service description and provider. Do not invent business address,
  certifications, customer counts, ratings, or delivery guarantees.
- A `/app` `SoftwareApplication` describes the reporting app, its verified
  iOS availability, and its existing App Store link. Omit price, review,
  rating, and offer fields unless independently verified and visible.
  Valid schema does not imply eligibility for Google's software rich result.
- Shared `WebPage` nodes and guide `TechArticle` nodes identify page subjects
  and task-first documentation. Add `BreadcrumbList` matching the visible
  Home → Site Reporting → Guides → current-guide navigation.

Accept structured data through a narrow layout prop or small helper. Emit
it during static rendering with `JSON.stringify` and escape `<` so content
cannot close the script element. Use no new runtime dependency.

Guide `lastVerified` is a review date, not a content-modification date. It
may be displayed as “Last verified” or emitted as `WebPage.lastReviewed`;
do not relabel it as `dateModified` or sitemap `lastmod`. Do not use build
time to fabricate freshness. Add real modification metadata only when the
publishing workflow can maintain it accurately.

### Crawling and indexing boundaries

Keep production public routes accessible to ordinary search crawlers and
AI search crawlers. Existing `User-agent: * / Allow: /` already allows
OpenAI's `OAI-SearchBot` and other compliant search crawlers. Search access
and model-training access are separate policies; do not change training
preferences as an incidental SEO change.

Mark `/confirm` and error pages `noindex`. Keep utility routes out of the
sitemap. Do not disallow `/confirm` in robots.txt in a way that prevents a
crawler from reading its `noindex` signal.

Use Cloudflare's existing preview `noindex` policy. Add a hostname-specific
rule in `public/_headers` so the production `harpa-pro.pages.dev` alias also
returns `X-Robots-Tag: noindex`, while `harpapro.com` remains indexable. Keep
build environment handling and deployment scripts unchanged. Canonicals
continue pointing to the production custom domain across deployments.

Review live Cloudflare headers and bot controls. Robots permissions do not
override a CDN challenge, authenticated origin, or bot-blocking rule. Avoid
broadly disabling security controls; verify official crawlers using their
published verification methods where available.

### AI-search access

The implementation improves crawlability, explicit entities, and useful
human-readable answers. It does not promise indexing, rankings, or AI
citations. Google documents that normal search fundamentals apply to its AI
features. OpenAI documents `OAI-SearchBot` as its search crawler, separately
from `GPTBot` training crawling.

Do not add `llms.txt`: it is not an indexing requirement or demonstrated
ranking signal. Prefer the existing HTML guides, sitemap, and internal
links. Keep the current visual design unchanged; metadata improvements
require no new UI.

### Follow-up from live search and competitor review

On 2026-10-10, a direct Google branded search placed the App Store listing
first and the Harpa Pro homepage second. Its branded AI Overview cited both.
This demonstrates current branded visibility, not general visibility for
procurement or construction-reporting queries. Search placement and AI
responses vary by location, account, and time.

The signed-out English Google sample used a Japan location. Harpa appeared
for the brand, but was absent from the sampled first-page results and AI
Overviews for “China furniture sourcing agent”, “interior procurement
China”, and “AI construction daily report app voice notes”. Results included
Globus China, Sorse Furniture, Interiors Projects, SuperReports, BuildPass,
and Daily Report ConstructionAI. A direct Perplexity check stopped at its
automatic security verification page, so visibility there is unverified.
This audit does not establish ChatGPT visibility or search volume.

Current app documentation is maintained and deployed with the public site
at `/reports/docs`. Repository notes about an earlier standalone docs host
are superseded by [product URL organization](design-site-product-url-organization.md).
Verify current guide content, canonicals, and redirects on this site's
preview and dev deployments.

Sampled competitor pages suggest useful content patterns: Source Foshan
explains quality checks with questions and answers; Sorse Furniture states
its sourcing scope explicitly; SuperReports identifies the reporting app's
audience, workflow, and common questions clearly. These are examples of
content clarity, not evidence that any pattern determines ranking or AI
citations. Apply them to existing verified Harpa Pro facts:

- Add a short visible procurement questions-and-answers section before the
  homepage contact section, using existing Section/Container typography and
  ordinary headings and paragraphs. Cover product scope, drawings and
  specifications, quality checks and document records, and information to
  include when contacting the team. Preserve alternating section tones by
  using the existing secondary tone for the following contact section.
  No new navigation or page layout.
- Product scope may name cabinetry, wardrobes, doors, wall panels, project
  joinery, hospitality and office furniture, and bathroom products, as
  already shown in `ProcurementEvidence.astro`. Do not extend this to
  unverified product categories, regions, or exclusive supplier claims.
- Explain drawing, dimension, finish, quantity, and approval checks before
  production; inspections at agreed production points; and packing, labels,
  freight documents, and delivery records. Base these answers on
  `ProcurementConsiderations.astro`, not invented guarantees.
- Describe the website's test reports and certificates as supporting
  documents to review against project requirements. Their presence is not
  proof that every order or product has a particular certification. Full
  source documents are not currently published on the website.
- Suggest that an enquiry include the project brief and available drawings,
  dimensions, finishes, quantities, and delivery requirements. Keep the
  existing email and WhatsApp contact actions; do not invent a mandatory
  intake process, quote turnaround, fees, or fulfillment promises.
- Clarify `/app`'s existing hero paragraph: the app serves construction site
  teams and creates an AI daily-report draft from their notes, photos, and
  voice updates for human review, editing, finalization, and PDF sharing.
  Keep availability and planned-feature statements consistent with the FAQ.
- Replace `VoiceDemo client:only="react"` with `client:load` if server
  rendering remains safe. Its initial state and waveform are deterministic;
  timers run inside effects. Preserve hydration, interactions, and the
  existing 640px card footprint. Product explanations remain normal HTML
  outside the demo regardless of this change.

Validate these additions in built HTML without JavaScript and in browser
interaction coverage. No FAQ rich-result or AI-citation promise accompanies
the questions; visible useful answers are the purpose. The user has now
explicitly requested merges through `dev` into `main`; apply required checks
and normal branch protection before each promotion.

### Procurement content priorities and measurement

The user's reference, [Youman China](https://youmanchina.com/), names a
specific audience, separates service enquiries by buyer need, and links to
practical procurement guides. Its
[supplier verification page](https://youmanchina.com/services/verify-supplier)
states the checks, limits, and written deliverable. Its
[buying guide](https://youmanchina.com/guides/how-to-buy-from-china) explains
the steps before offering contact. These suggest future Harpa content:
documented project examples with permission, a specifications checklist,
and service pages explaining scope and deliverables. Confirm the intended
buyers, destination markets, service terms, and supporting evidence before
publishing those pages. Do not copy another business's fees, shipping
estimates, capabilities, or claims.

The sampled searches are relevance probes, not validated keyword demand.
In particular, “China furniture sourcing agent” has no measured volume in
this audit. Prioritise keywords using Search Console query impressions,
clicks, CTR, and position for Harpa's existing visibility, alongside Keyword
Planner's monthly search estimates for the chosen destination markets.
Google Trends measures relative interest, not absolute monthly searches.
Search Console opens signed out in this session; no Analytics integration
was found in the site code or connected tools. Account reports and market
volume remain unverified. Do not add tracking scripts as an incidental SEO
change.

## Validation and release

Inspect the real built HTML, not only helper output. Verify every sitemap
page returns HTML with a unique title, description, production canonical,
one main heading, valid parseable JSON-LD, and crawlable body text. Verify
structured entities match page subjects and breadcrumb URLs match rendered
navigation. Include query-string and trailing-slash canonical cases.

Check `/confirm` and 404 remain excluded from the sitemap and carry
`noindex`. Verify the hostname-specific header rule in the built artifact
and check production and preview response headers after deployment. Run
site unit tests, type check, lint, static build, and browser coverage.
Existing sitemap-discovered links and fragments must still resolve.

After deployment, inspect production and preview headers, robots, sitemap,
and crawler access. Verify the domain in Google Search Console and Bing
Webmaster Tools, submit the sitemap, and inspect `/`, `/app`, and a guide.
Use Google's Rich Results Test or Schema.org validator to inspect the
relevant markup. Monitor indexing, search impressions, clicks, and referral
traffic over time. Account verification and sitemap submission depend on
access to the corresponding services; code alone cannot complete them.

Changes target `dev` first. Production promotion to `main` requires explicit
user authorization, which the follow-up request now provides, and passing
required checks. Never bypass branch protection.

## Primary references

- [Google AI features and websites](https://developers.google.com/search/docs/appearance/ai-features)
- [Google guidance for generative AI search](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots)
- [Google software application markup](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- [Google breadcrumb markup](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
- [Cloudflare preview indexing](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Google Search Console performance reports](https://support.google.com/webmasters/answer/10268906)
- [Google Keyword Planner](https://support.google.com/google-ads/answer/7337243)
- [Google Trends data](https://support.google.com/trends/answer/4365533)
