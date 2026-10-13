# How to buy from China article

## Purpose and source

Publish the user's procurement draft as a useful public page for architects
and interior designers at `/how-to-buy-from-china`. The source is the
root-checkout file `How to buy from China - For architects and interior
designers copy.txt`. Keep its practical six-step progression and intended
audience, with light edits for grammar, clarity, and factual accuracy.

The current procurement homepage,
[`design-site-luxury-experiment.md`](design-site-luxury-experiment.md), and
[`design-site-search-discoverability.md`](design-site-search-discoverability.md)
define the visual direction, product context, and discoverability rules.
The luxury direction now extends to this procurement guide through the
route's own wrapper. The existing `/docs` collection remains reporting app
guidance.

## Content contract

Use one H1, “How to buy from China”, with an audience subtitle and a short
introduction explaining that destination clearance comes before ordering.
Preserve six numbered H2 sections:

1. Check port clearance and import requirements.
2. Start with a detailed product specification.
3. Know who you are talking to.
4. Know what a quotation includes.
5. Buy and keep a sample.
6. Agree payment terms and inspect before shipping.

Retain the Ghana, Kenya, Nigeria, and Tanzania examples and link to the
relevant official customs, standards, and port sources using descriptive
link labels. Verify current regulatory details before publication and
qualify examples by exact product and destination. Avoid fixed duty rates,
processing timelines, or treating a changing conformity arrangement as
universal. Clearly state that the importer should confirm requirements
with the relevant authority and clearing agent before shipment.

Keep the draft's specification, quotation, sample, inspection, and payment
advice. Soften claims that factories always have the best prices, lack
English-speaking staff, or that a lower quote necessarily means a different
product. A sample is an agreed reference, not proof of production capability
or order-wide conformity. A 30% deposit is an example to negotiate, not a
guaranteed standard. Replace unverified claims about lawful currency routes,
domiciliary accounts, and local-currency agent payments with advice to
confirm permitted payment methods, fees, exchange rates, beneficiary details,
and documentary evidence with the bank or authorised payment provider.

End with a modest link to the existing homepage contact section for readers
who want help coordinating procurement. Do not invent service terms, fees,
destinations served, guarantees, certifications, or an individual author.

## Page design

Preserve the static Astro route, separately authored MDX content, and
`getHeadings()` contents links. Use shared `Layout`, `Header`, `Footer`,
`Section`, and `Container`. Import the existing `styles/luxury.css` and wrap
the header, main, and footer in `.luxury-site`, with a guide-specific class
such as `.procurement-guide` for article adjustments. This opts into the
homepage's walnut masthead, porcelain footer, and material tokens without
changing shared components or their navigation behaviour.

Use walnut text, limestone page surfaces, porcelain reading surfaces, and
quiet bronze rules. Use the existing self-hosted Cormorant Garamond 500 for
the H1 and six H2 step headings, with the established serif fallback. Keep
Inter for paragraphs, country H3s, links, contents, breadcrumbs, byline,
controls, and the compact semibold Harpa Pro wordmark. Avoid applying the
homepage's oversized heading sizes and decorative H2 rule to every country
subsection. Scope any corrections to the guide wrapper; do not edit global
`docs-prose` styling or the homepage stylesheet's existing rules.

Place visible breadcrumbs above an editorial introduction. At desktop
widths, pair the title, audience subtitle, introduction, and byline with a
restrained landscape image of the existing
`assets/agents/finishes/wood.webp` concept. Keep the title on a plain light
surface, with a maximum display size around 5rem and natural wrapping.
The image supports the subject; it does not become a viewport-height hero.
Use a roughly 16:10 frame, responsive Astro image output, reserved dimensions,
and no image-switching controls. Caption it “Generated material concept ·
Wood” and describe the generated living-room concept in its alt text. Do not
present it as a completed Harpa project or supplied products. Stack the
introduction and image at compact widths, with a shallow image frame and
the H1 around 3rem on phones.

Below a quiet divider, use a two-column reading layout from 1024px: a 15rem
"On this page" rail beside a maximum 44rem article column, targeting
approximately 65–75 characters per line.
Keep the rail sticky below the 4rem masthead, with a 6rem top offset and
enough available height to scroll its six links on short viewports. Place
the rail in normal document flow before the article at smaller widths;
all six links remain visible in an ordinary list. Do not add a duplicate
contents list, collapse required content, or introduce a rounded navigation
card.

Retain `docs-prose` paragraph and list rhythm, adjusting the guide's text
colour and display headings locally to use the material tokens. Body text
stays at least 1rem with approximately 1.75 line height. Step H2s use a
readable 2–2.5rem serif scale; country H3s remain compact Inter. Keep source
links underlined and allow long labels to wrap. Separate major steps with
whitespace and restrained rules rather than cards. Place the existing
procurement-support link below the article using the same quiet framing.

Keep headings clear of the sticky masthead with a 6rem anchor offset.
All content, image captions, breadcrumbs, and contents links render without
JavaScript. Preserve visible focus and ordinary scrolling. No new motion,
blog index, collection, CMS, dependency, or illustration generation is
required. Scope the implementation to this guide route and its own styles;
homepage, `/app`, reporting docs, and shared tokens retain their current
appearance and behaviour.

## Discovery

Follow the shared [Procurement menu scope](design-site-two-page-navigation.md):
the restored desktop dropdown and mobile Procurement group contain Procurement
Overview and How to Buy from China. Retain the previous Site Reporting links,
separate desktop Contact Us button, and grouped footer. Keep the buying guide
in the footer Procurement links. Add its canonical path to the static sitemap
list.

Show visible breadcrumbs “Home → How to buy from China”. The page uses a
unique procurement-specific title and description. Use the existing Wood
concept for its social image, with accurate generated-concept alt text, and
keep the Article image reference consistent. Pass `Article` and matching `BreadcrumbList`
JSON-LD through the existing `structuredData` prop; the shared page node
can remain `WebPage`. The Article has a stable `@id`, canonical URL,
headline, description, publisher/author organisation reference, language,
and `mainEntityOfPage`. Do not fabricate publishing dates or ratings.
Canonical and breadcrumb URLs use `https://harpapro.com` without a trailing
slash and match visible navigation. Continue the layout's escaped JSON-LD
serialization and existing preview indexing policy.
The shared layout accepts an optional Open Graph type; this page uses
`article`, while the default remains `website` for existing pages.

The Kenya source links use the March 2026 KEBS PVoC manual rather than the
draft's February transition notice. Tanzania links use the standards service
page and government import procedure instead of the older guideline and
port links that could not be fetched during verification. Country summaries
cite the official sources beside the relevant advice.

## Validation

Run site unit tests, typecheck, lint, and static build. Inspect the built
article HTML for the H1, all six sections, working step anchors, source
links, unique metadata, production canonical, parseable Article and
BreadcrumbList data, and sitemap inclusion. Extend the existing sitemap and
SEO coverage for the required route, Article markup, contents, and visible
breadcrumbs. Verify article discovery in desktop/mobile navigation and
footer, step-anchor navigation, and phone overflow in browser checks.
Run existing sitemap/navigation and SEO browser coverage, which discovers
every sitemap route and validates its internal links and metadata. Inspect
the page at 1440, 1024, 768, and 390 CSS pixels. Verify the luxury masthead
and footer, Cormorant H1/H2, Inter body and wordmark, concept caption,
readable contrast, title wrapping, image aspect ratio, and no overflow.
Check the desktop rail stays below the header and remains usable in a short
viewport; tablet and phone contents must appear inline before the article.
Exercise every contents link and desktop/mobile menu using keyboard and
pointer, and inspect the page without JavaScript and with reduced motion.
Confirm homepage, `/app`, and one reporting guide retain their existing
styles. Run site unit tests, typecheck, lint, build, and relevant browser
coverage again after the guide's visual revision.
Deployment and search indexing are separate from creating this page.

Initial article verification on 2026-10-12, before the luxury visual
revision: 28 unit tests and all 26 Chromium browser
tests passed, along with typecheck, lint, and the static build. Phone review
at 390px confirmed no horizontal overflow, six working contents anchors,
and headings clear of the sticky header. Firefox checks could not complete
because the local browser failed to find its temporary profile folder.

Luxury revision verification on 2026-10-13: all 32 Chromium browser checks
passed. Desktop, tablet, and phone review at 1440, 1024, 768, and 390 CSS
pixels confirmed the intended typography, zero horizontal overflow, and
responsive contents placement. The desktop rail remains usable in a 500px
tall viewport, and step anchors clear the sticky masthead. The same PR removes
the homepage's image hover scaling at the user's request, as recorded in
the [luxury experiment](design-site-luxury-experiment.md).

Luxury revision verified locally on 2026-10-13: all 28 unit tests and 32
Chromium browser tests passed, alongside typecheck, lint, and the static
build. The article's Lighthouse desktop scores were 100 for performance,
accessibility, best practices, and SEO. Existing no-JavaScript SEO coverage
checks the article, six sections, contents, concept caption, breadcrumbs,
production identity, display/body fonts, and walnut text. The shared
navigation checks cover desktop and mobile article discovery.
