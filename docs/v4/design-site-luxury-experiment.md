# Procurement homepage luxury experiment

Status: implemented as a local visual experiment.

## Context

Harpa Pro coordinates luxury furniture and interior procurement in China. The
homepage already contains the service description, supplier examples, product
specifications, document previews, technical reviews, and contact actions.
Its current rounded-card presentation makes that work feel more like software
documentation than a considered interiors service.

The user requests an adventurous visual experiment with enough embellishment
to evaluate and remove later. This authorizes a new homepage visual direction.
For `/`, this document supersedes the palette, Inter-only display typography,
inset desktop hero, and single-line desktop title decisions in
[visual hierarchy](design-public-site-visual-hierarchy.md) and
[procurement polish](design-public-site-procurement-polish.md). Their content,
responsive, navigation, and interaction requirements still apply.

## Direction

Present procurement as a material and specification folio: an interior image
introduces the destination, while the sections below show the materials,
factory information, approvals, and people required to reach it. The visitor
is a designer, developer, or project owner evaluating a procurement partner.
The page's job is to connect that visitor with the procurement team after
giving them enough concrete evidence to assess the service.

The signature is the existing interior photograph with an oversized editorial
title layered over the darker part of the room. Let the title wrap into a
deliberate composition at wide widths; do not force the long service name onto
one line. Give the image more of the viewport and the copy a clear anchored
position. Add useful routes to the existing factory evidence and contact
sections. A small interior/material caption or a restrained material strip may
support the image, provided it describes the service or photograph accurately.

Use material-inspired home-only colors: walnut ink, pale limestone, porcelain,
muted bronze, and the existing Harpa orange. Define color values in `oklch`,
following the site's existing rule. Suggested starting tokens are:

| Role         | Starting value          | Use                                      |
| ------------ | ----------------------- | ---------------------------------------- |
| Walnut       | `oklch(0.27 0.018 65)`  | Hero scrim and dark section surfaces     |
| Limestone    | `oklch(0.96 0.012 80)`  | Main light surface                       |
| Porcelain    | `oklch(0.99 0.006 85)`  | Paper and readable card interiors        |
| Bronze       | `oklch(0.68 0.048 75)`  | Quiet rules and decorative material cues |
| Harpa orange | Existing `--accent`     | Brand identity and decorative accents    |
| Orange ink   | Existing `--accent-ink` | Compact buttons and small text           |

Pair the current Inter body and utility typography with self-hosted Cormorant
Garamond at weight 500, using regular and italic styles. Keep a native
Palatino/Georgia serif fallback so content remains readable before the font
loads. This needs no package or runtime remote font request. Serif display
type belongs to the hero and major section headings; specifications, contact
addresses, navigation, controls, and card copy remain easy to scan. Use
uppercase, spaced small labels sparingly for real categories.

The material folio needs to remain specific to procurement. Keep real factory
photographs, furniture examples, test-report crops, and technical drawings.
Avoid invented luxury client logos, awards, project counts, testimonials, or
guarantees. Preserve body copy and source-package labels unless a small change
is required to clarify an existing fact.

## Page composition

Keep the existing sequence and fragment identifiers: hero, considerations,
factory partners, quote contents, product examples, factory documents,
technical reviews, procurement profiles, questions, contact, footer.

Within `#top`, place a short service introduction below the hero image to lead
into the working detail. It remains part of the hero section. The hero's main
actions point to Contact Us and the existing considerations section.

Add an optional A closer look control with Room, Stone, and Texture buttons.
These are views of the same existing interior image, using bounded scale and
position changes with accurate photograph captions. Mark the active view
with `aria-pressed`. They do not claim that the image depicts a completed
Harpa project or that any pictured material is a supplied product. Without
JavaScript, the default room composition remains useful.

Make the header feel like an interiors studio masthead while retaining its
opaque sticky surface and native disclosure behavior. Keep Procurement, Site
Reporting, and Contact Us available on desktop and the current grouped mobile
menu. The app offer continues to live under `/app`.

Treat What We Consider as a dark material workspace with a larger selected
image, quiet detail framing, and visible category controls. Keep the existing
five-tab selection and keyboard interaction. All controls and selected panels
still reserve consistent heights at each breakpoint.

Give factory and product photography an editorial frame with calmer borders,
less rounded corners, more intentional whitespace, and a subtle image hover.
AIS remains the featured example with the four other partners compact below.
Product examples remain a compact row at wide widths and stack on phones.
Document previews keep their top-third crops and three-before-expansion rule.
Technical drawings continue to use `object-contain` so details are not lost.

Give the team portraits room and make contact the closing visual moment with
an oversized serif heading, darker surface if contrast permits, and the same
email and WhatsApp actions. Keep the two credential dividers aligned whenever
profiles appear side by side. Preserve title case for marketing headings and
sentence case for controls and body copy.

## Optional enhancement layers

Use native CSS and a small browser script; add no motion library or other
dependency. Keep decorative enhancements separate so they can be removed
without replacing content or changing navigation:

- A small first-view image scale settles into the hero frame. The optional
  image-view buttons may provide a closer crop after explicit activation.
- A restrained scroll reveal brings section headings or image frames into
  place as the visitor reaches them. Do not hide substantive body content.
- Fine-pointer hover gently enlarges photos inside their existing crop and
  moves action arrows a few pixels. Focus has an equally clear treatment.
- Quiet paper/material texture, inset framing, or reflection accents may
  enrich surfaces without obscuring text, drawings, or document previews.
- A thin reading-progress rule may sit on the masthead, marked decorative,
  using CSS scroll-driven animation only when supported.

Do not intercept normal scrolling, delay navigation, pin long sections, or
require a cursor effect to use the page. Without JavaScript, the whole page
and existing native disclosures remain available. If `IntersectionObserver`
is unavailable, section content remains visible. Use a single observer and
stop observing sections after their entrance completes.

Honor `prefers-reduced-motion: reduce`: disable image drift, entrance motion,
decorative moving rules, and smooth scrolling. Avoid animation on coarse
pointers where it competes with touch. Base styles must be readable and stable
before enhancement initialization; motion must not create layout shifts.

## Implementation boundaries

Scope styling beneath a homepage wrapper, for example `.luxury-site`. Shared
header/footer changes are opt-in through that wrapper; `/app`, guides,
roadmap, legal routes, dashboard, and mobile tokens keep their current design.
Prefer a separate homepage stylesheet with clear groups for palette/type,
hero, sections, and motion. Removing motion rules and its small script should
leave the visual composition intact.

The planned files are `styles/luxury.css` for the home-only composition and
`components/agents/LuxuryEffects.astro` for image-view selection and entrance
enhancement. Headings may use the Web Animations API after intersection;
their base CSS never sets them transparent or offsets them before the script
starts. Use native CSS transitions for decorative hover behavior.

Use existing hooks where possible:

- `pages/index.astro`: `[data-hero-visual]`, `[data-hero-scrim]`,
  `[data-hero-copy]`, `[data-procurement-profile]`, and contact actions.
- `components/landing/Header.astro`: `[data-site-header]`,
  `[data-mega-menu]`, and `[data-mobile-menu]`.
- `components/agents/ProcurementConsiderations.astro`:
  `[data-consideration-tab]`, `[data-consideration-panel]`, and
  `[data-consideration-image-frame]`.
- `components/agents/ProcurementEvidence.astro`: `[data-factory-partner]`,
  `[data-factory-image-frame]`, `[data-product-brief]`,
  `[data-product-image-frame]`, `[data-credential-record]`, and
  `[data-technical-review]`.

Keep the hero's Astro image high priority and responsive. Below-fold imagery
remains lazy. Preserve the existing preview-first evidence image dialog from
[progressive evidence images](design-site-progressive-evidence-images.md).
Do not reintroduce source-document downloads or add external-service calls.

## Validation

Run the site unit tests, lint, type check, production build, and focused
Playwright homepage/navigation coverage. Update existing presentation tests
whose assertions are explicitly superseded by this design, while preserving
behavior checks for navigation, tabs, evidence dialogs, disclosure, clipboard
fallback, and contact destinations.

Inspect desktop, compact desktop, tablet, and phone widths, including 1440,
1280, 1024, 768, and 390 CSS pixels. Verify visible focus, legible hero text,
no horizontal overflow, equal-height consideration states, aligned profile
credentials, reduced-motion behavior, and useful content without JavaScript.
Confirm that the shared app and docs routes retain their baseline styling.
