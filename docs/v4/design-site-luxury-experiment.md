# Procurement homepage luxury experiment

Status: implemented as a local visual experiment.

Material-scheme revision: implemented. The user requests complete alternative
room images and a lighter hero scrim.

Material-balance refinement: implemented. The user prefers
subtle, professionally composed interiors over repeated single-material
finishes across the whole room.

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

The signature is an interior concept image with an oversized editorial title
layered over the darker part of the room. Let the title wrap into a
deliberate composition at wide widths; do not force the long service name onto
one line. Give the image more of the viewport and the copy a clear anchored
position. Add useful routes to the existing factory evidence and contact
sections. A small interior/material caption or a restrained material strip may
support the image, provided it describes the service or concept accurately.

Use three generated interior concepts for the hero, keeping the same room
layout, camera position, furniture arrangement, aspect ratio, and lighting.
Only the material scheme changes: Wood, Stone & Marble, and Glass & Modern.
Wood is the default. These images illustrate material direction; they do not
depict completed Harpa projects or prove supplied products. Keep that meaning
clear in the visible concept caption and each image's descriptive alt text.
The factory, furniture, document, and drawing evidence elsewhere stays real.

### Balanced material schemes

Keep the same room, camera, furniture silhouettes, and daylight. Give each
scheme its own restrained palette and a clear hierarchy of finishes. A
material name describes the direction, not every surface in the room. Avoid
repeating identical grain, veining, or reflective metal across walls, floors,
joinery, and tables.

- Wood: walnut joinery, chalk plaster, pale honed stone, natural linen, and a
  muted olive accent. Timber remains the principal joinery finish; tables,
  floors, and surrounding walls provide contrast.
- Stone & Marble: a subtly veined marble coffee table and one controlled stone
  detail, with painted joinery, oak shelf interiors, matte plaster, soft
  textiles, and a muted wine accent. Keep broad surfaces quiet.
- Glass & Modern: a smoked-glass coffee table and limited glass cabinet
  fronts, with deep blue-grey joinery, warm oak details, matte plaster,
  pale stone flooring, and tactile upholstery. Use metal for small fittings;
  avoid mirrored walls, metal-clad architecture, or transparent islands.

The result should look like three credible material selections by an interior
designer. Inspect the generated scenes for material balance and believable
construction before replacing the current assets. Preserve the lighter scrim
and the existing image-switching behavior.

Lighten the scrim so visitors can see the room and material changes. Reduce
the broad dark overlay while retaining a local gradient behind the title,
description, and controls. Verify legibility against all three images at each
supported viewport rather than assuming the default image is representative.

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

Keep the Harpa Pro wordmark in the shared Inter sans-serif treatment, as
requested by the user. Use the same compact size, semibold weight, and letter
spacing in the header and footer. The homepage may adjust its color for the
dark masthead; serif display styling belongs to the editorial headings.

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

Keep the optional A closer look control, with Wood, Stone & Marble, and
Glass & Modern buttons. Activation replaces the complete hero image with the
selected material scheme instead of enlarging a crop. All schemes keep the
same composition so the visitor can compare finishes without losing the room
context. Mark the displayed scheme with `aria-pressed`; preserve the selected
button's focus during loading and replacement.

The default Wood image renders server-side as a responsive, high-priority
Astro image. Without JavaScript, that image, its concept description, the hero
copy, and both anchor actions remain useful. Hide optional scheme buttons
until their script has initialized. Keep the visible default concept caption
outside any controls wrapper that is hidden without JavaScript.

Generate responsive URLs and width metadata for each alternate with Astro's
`getImage` at build time. Serialize that metadata without inserting alternate
image `src` or `srcset` attributes into the initial DOM. Fetch an alternate
only after its button is activated, using its responsive `srcset` and `sizes`
to choose an appropriate file for the viewport. Keep the current image visible
while the requested scheme loads and decodes.

After a successful decode, fade the ready image into full opacity and
update its alt text, concept caption, and pressed button together. Keep the
image frame's dimensions unchanged. Under reduced motion, replace it
immediately. Cancel a pending fade when the reduced-motion preference changes.
A late response from an earlier choice must not replace a more recent choice.

Use a polite caption/status region to announce loading and a recoverable
failure. If loading or decoding fails, keep the previous image, its alt text,
and its pressed button; say that the requested scheme could not load and that
the visitor can try again. Do not clear the hero, expose a broken image, or
disable the other choices. Selecting the same failed scheme again retries it.

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

- The optional material-scheme buttons replace the complete room image after
  explicit activation, with a short fade once the next image is ready.
- A restrained scroll reveal brings section headings or image frames into
  place as the visitor reaches them. Do not hide substantive body content.
- Keep image scale unchanged on hover, as requested by the user. Fine-pointer
  hover may emphasize photo color and move action arrows a few pixels. Focus
  has an equally clear treatment.
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

The implementation files are `styles/luxury.css` for the home-only composition
and `components/agents/LuxuryEffects.astro` for material-scheme selection and
entrance enhancement. Store the generated concepts with the existing site
assets; remove the earlier crop-transform rules. Headings may use the Web
Animations API after intersection;
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

Keep the default Wood hero's Astro image high priority and responsive; its
concept alt text also applies to social metadata that uses that image. Keep
alternate hero assets on demand and below-fold imagery lazy. Preserve the
existing preview-first evidence image dialog from
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

For the material-scheme revision, verify all three complete images and their
captions, mutually exclusive pressed states, stable frame geometry, and visible
keyboard focus. Assert that alternate assets are not requested before a choice
is activated. Delay one alternate response and confirm the current image stays
visible until decode completes; fail another response and confirm the current
image and selection remain intact and retry succeeds. Cover rapid selection,
reduced-motion replacement, and the default Wood composition without
JavaScript. Inspect the lighter scrim with every material scheme on desktop
and phone.
