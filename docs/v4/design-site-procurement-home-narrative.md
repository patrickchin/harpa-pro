# Procurement homepage narrative

Status: implemented. Needs owner review of the page structure.

## Context

The procurement homepage (`/`) had grown to ten sections: hero, What We
Consider, Selected Factory Partners, What Each Quote Includes, Product
Examples, Factory Documents, Technical Reviews, team, questions, and contact.
At the start of this change it measured 7,807 px at 1280 px, 10,830 px at
768 px, and 13,800 px at 390 px. Several sections overlapped:

- What Each Quote Includes and Product Examples explained the same idea.
- Technical Reviews showed the drawing checks that Design and Specification
  already described.
- The full Factory Documents grid was reference material that most visitors
  do not need on the homepage.

The AIS factory photo also relied on `scale-[1.18]` to hide a caption embedded
in the catalogue image. The contact email card made **Copy email** the primary
action and reserved space for an empty status line.

This change supersedes the section order and evidence layout in
[procurement polish](design-public-site-procurement-polish.md), the evidence
disclosure in
[mega navigation and evidence disclosure](design-public-site-mega-navigation-and-evidence-disclosure.md),
the portrait sizes in [procurement team](design-site-procurement-team.md), and
the email action order in
[product navigation](design-public-site-product-navigation.md).

## Decision

The homepage follows this order. Each item is one `main > section`.

1. **Hero** (`#top`): unchanged.
2. **What We Consider** (`#considerations`): the five process tabs. The
   Design and Specification panel shows the Revit A104 coordination sheet and
   the A103 shop-drawing sheet side by side. Each sheet opens the shared
   evidence lightbox with its original review caption. The pair carries
   `id="technical-reviews"`, so old links still land on the reviews. The
   desktop panel is 24 rem tall (previously 28 rem). The text column below
   `lg` uses the smallest minimum height that fits the longest description.
3. **Partners and evidence** (`#evidence`):
   - `#factory-partners`: the featured AIS card and four compact partner
     cards. Below `sm`, the compact cards place a 7.5 rem image beside the
     text.
   - `#quote-contents`: one block that combines the eight-item quote checklist
     with the three product examples (`#product-examples`). The examples keep
     their image, source, title, and description. The per-example
     specification lists are removed because the checklist covers the same
     fields. Below `lg`, the examples sit in a horizontal, keyboard-focusable
     scroll-snap row. From `lg` upward, they show as three columns.
   - `#factory-documents`: a summary card with the document count, the source
     factories, three decorative first-page previews (from `md` upward), and
     **View all factory documents**.
4. **Team** (`#agent`): content is unchanged. Portraits are 5.5 rem below
   `sm` and 10 rem from `sm` upward. They always sit beside the bio.
5. **Procurement Questions** (`#procurement-questions`): unchanged content.
   The row gap is tighter.
6. **Contact Us** (`#contact`): both cards use the same structure: a label, a
   value, a full-width primary action, and a full-width secondary action.
   **Open email app** (`mailto:`) is the primary accent action. **Copy email**
   is the outline secondary action. The copy status line takes no space until
   it has text.

Every old fragment (`#considerations`, `#technical-reviews`, `#evidence`,
`#factory-partners`, `#quote-contents`, `#product-examples`,
`#factory-documents`, `#agent`, `#procurement-questions`, `#contact`) still
exists on the homepage. Header and Footer links need no changes.

### Factory documents page

`/procurement/factory-documents` lists all nine factory-supplied documents.
Each card shows the first-page preview, title, source package, reference,
and the description that was previously visible only in the lightbox caption.
Each preview opens the shared evidence lightbox. The page uses the luxury
palette, a breadcrumb, and the procurement social card. It appears in the
sitemap. `factory-documents` is a reserved procurement guide slug.

The document data lives in `src/lib/procurement/factory-documents.ts`.
`FactoryDocumentGrid.astro` renders the grid. The old
`/documents/factories/*` redirect now points to this page instead of
`/#evidence`.

The page passes `section="procurement"` to `Layout`, `Header`, and `Footer`.
Its breadcrumb starts at the procurement root. In
`src/lib/site/sections.ts`, the procurement footer column, which the shared
footer also uses, lists **Factory documents** after the header links. The
header menu keeps its five main entry points.

### Pre-cropped imagery

`assets/procurement/factories/ais-factory-exterior-photo.webp` (871×478) is
cropped from `ais-factory-exterior.webp` with
`sharp().extract({ left: 5, top: 5, width: 871, height: 478 })`. The crop
removes the white border and the embedded “Shishan Headquarters and Factory”
caption. Both the AIS partner card and the Factory and Product Fit panel use
the derivative with a plain `object-cover`. The source file stays in the
repository for future crops.

## Results

| Width | Before | After |
| --- | --- | --- |
| 1280 px | 7,807 px | 5,964 px |
| 768 px | 10,830 px | 7,626 px |
| 390 px | 13,800 px | 9,074 px |

Heights are `document.documentElement.scrollHeight` on a production build
after lazy images have loaded.

## Verification

- `tests/agents.spec.ts` covers the merged reviews, partner and quote block,
  documents summary, documents page, dialog behaviour, crop without
  transforms, and email action order.
- `tests/procurement.spec.ts` covers the documents page without JavaScript,
  its sitemap entry, and every legacy fragment.
- `tests/landing-copy.spec.ts`, `tests/responsive-layout.spec.ts`,
  `tests/redirects.spec.ts`, and `tests/a11y.spec.ts` cover the section order,
  team layout, document grid rows, redirect target, and skip link.
- `src/__tests__/image-performance.test.ts` checks that the AIS derivative is
  871×478 and that no `scale-[` crop remains.
