# Procurement article series

## Purpose and baseline

Add fifteen procurement guides for architects, interior designers, and other
buyers sourcing from China. Each article receives an independently reviewed
draft PR against `dev`. The existing buying guide and its country sections
remain the series entry point.

The baseline is `origin/dev`, including
`apps/site/src/pages/procurement/how-to-buy-from-china.astro`, its separately
authored MDX, and `docs/v4/design-site-how-to-buy-from-china.md`. The current
local `main` checkout predates this site. Use an isolated worktree based on
`origin/dev`; preserve the user's untracked source text.

## Smallest implementation

Create one foundation PR before the fifteen content PRs. Reuse Astro's
existing content collections, MDX renderer, shared site components, and
static generation. Add no dependencies, CMS, client-side search, filters,
pagination. Article-specific generated illustrations are added by the
[article image design](design-procurement-article-images.md).

Extract the existing procurement article wrapper into
`apps/site/src/layouts/ProcurementGuide.astro`. Its inputs are title,
description, audience subtitle, H2 headings, and the canonical article path;
the content renders through its ordinary slot. Preserve the existing Wood
concept, accurate generated-image caption and alt text, article metadata,
organisation byline, contact aside, layout styles, and responsive contents
rail. The old static route becomes a thin wrapper passing its current
copy, headings, and MDX content into this layout. Preserve its canonical
path and country anchors. Do not move its MDX into the new collection.

Add a `procurementGuides` collection to `content.config.ts`, reading only
`src/content/procurement/guides/**/*.mdx`. Files in the original
procurement directory remain independently authored and do not need
frontmatter migration. Schema requires `title`, `description`, and positive
integer `order`. A last-verification date can be added only if the project
uses it to communicate a real editorial verification event. Derive slugs
from filenames; do not add a second slug field. Draft source files may
contain editorial `status` metadata while being prepared, but PR draft
status is the publication gate. Strip editorial-only metadata during
integration rather than introducing preview/environment publication logic.

Create `src/pages/procurement/[slug].astro` using `getStaticPaths`,
`getCollection`, and `render` from `astro:content`. Generate one static route
per collection entry, pass its headings and content to `ProcurementGuide`,
and use the entry ID as its path segment. Existing static routes take
precedence. Reserve `guides` and `how-to-buy-from-china`; content validation
must reject either as a new article slug. There is no runtime routing or
fetching.

Create a simple static `/procurement/guides` index. Reuse shared `Layout`,
`Header`, `Footer`, `Container`, `Section`, and luxury tokens. Include the
existing main buying guide first, then the collection sorted by `order`
with each article's title and description. Use ordinary text links in a
single editorial list, with quiet rules. The index has one H1, visible
breadcrumbs, a production canonical URL, and unique metadata. An empty
collection still produces a useful page linking to the existing guide.

## Discovery and structured data

Add “Procurement guides” to the existing Procurement navigation group and
footer, preserving their established desktop/mobile behaviour. Add a
restrained “Browse all procurement guides” link on the article wrapper so
the existing entry guide discovers new articles without repeated edits.

Add `/procurement/guides` to the sitemap's static paths. Append generated
article paths from the collection, preserving the existing static buying
guide and reports-doc paths. Do not hand-maintain a second article registry.
Use an exported small path/sort helper only where both sitemap and index
need it; avoid a service or content abstraction layer.

All article routes use unique titles, descriptions, `og:type=article`,
Article JSON-LD, and a BreadcrumbList matching visible breadcrumbs. Retain
the existing canonical site identity and escaped JSON-LD serialization.
The shared Wood image remains a generated material concept and must never
imply that a supplier, shipment, or completed project has been photographed.
Do not invent publishing dates, individual authors, ratings, or guarantees.

## Reading behaviour

Keep the established walnut, limestone, porcelain, and bronze article
appearance. Preserve Cormorant display headings, Inter body text, the
44rem reading column, inline phone/tablet contents, sticky desktop rail,
6rem heading anchor clearance, keyboard focus, and zero-JavaScript content.

New articles use MDX so the renderer can map each table to a native table
inside a named, keyboard-focusable scroll region. No client script is needed.

New articles include comparison tables and a few downloadable CSV files.
Constrain tables within the reading column and allow local horizontal
scrolling where necessary; the document itself must not overflow. Keep
table text readable, source labels wrappable, and download links descriptive.
Place downloads under `public/downloads/procurement/`, referenced by their
stable public paths. Include each download in the same PR as its article.
Do not add spreadsheet software or client-side calculators.

## Content contract

Articles cover supplier verification; landed cost; Alibaba/1688/direct
buying; a first small order; quality inspection; supplier types; comparable
quotes; negotiation; payments; Incoterms; transport modes; consolidation;
private-label/custom scope; problem goods; and a worked order walkthrough.

Each article stands on its own and links to the existing buying guide's
country sections when destination rules matter. Exact country, product,
duty, conformity, or licensing requirements stay in those sections. Verify
unstable facts with current primary sources, linking beside the supported
claim. Example numbers are explicitly hypothetical, with checked arithmetic.
Inspections, registration checks, or platform badges are never presented as
guarantees.

The final walkthrough is labelled a hypothetical worked example in title,
description, and introduction. Converting it into a real case study requires
an actual order record and permission to use the facts. Never fabricate
company experience, customer savings, photographs, or supplier relationships.

## PR structure and dependencies

The foundation PR contains this design, reusable wrapper, collection and
routes, index/discovery, sitemap, and focused existing-test extensions. It
contains no new article drafts. The existing guide must remain fully usable
and the index must work with zero new entries.

Each of the fifteen subsequent draft PRs adds exactly one article and its
own promised downloads. They depend on the foundation PR, but never on one
another. Open them against `dev`, with that dependency explicit in the PR
description. They may be reviewed for content before foundation merges;
validate their complete page against a local combination of foundation plus
that article and report the exact validation state honestly. After the
foundation merges, update article branches normally to remove the shared
dependency from the diff. Do not merge or publish automatically.

Avoid adding links to unmerged sibling articles. Once articles are live,
cross-linking can be reviewed in a later small follow-up. The collection
index and sitemap discover each article automatically after it merges.

## Validation

Run the site's existing unit tests, typecheck, lint, and static build on the
foundation. Extend coverage to require index discovery, collection article
paths, unique canonical metadata, reserved slug protection, and renderable
headings. Verify an isolated article fixture can render in the new system
without permanently adding a fake production article.

Review browser rendering of the existing guide, new index, and one
representative long article at desktop and phone widths. Exercise contents
anchors, desktop/mobile navigation, source links, and download links.
Inspect the existing country anchors and reporting routes for regressions.
Check no-JavaScript reading and table overflow. Save screenshots under
`~/Pictures/Screenshots/Codex/harpa-pro/`.

For each article PR, validate its frontmatter and standalone build against
the foundation, check source attribution and internal links, and inspect
its rendered headings/tables. Parse CSV downloads and verify example
arithmetic. Repeat broader tests only when content introduces new rendering
behaviour or the implementation changes. Record checks and limitations in
the PR; do not mark any unrun check passed.
