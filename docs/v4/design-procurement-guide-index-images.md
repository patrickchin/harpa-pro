# Procurement guide index images and combined preview

## Purpose

Give `/procurement/guides` compact, concrete editorial thumbnails and clearly
separated article rows. Provide one Cloudflare preview containing the complete
fifteen-article series. Build
on the [article series](design-procurement-article-series.md) and
[article image contract](design-procurement-article-images.md).

## Index composition

Keep the title, introductory copy, article order, typography, and material
palette. Use an editorial list with one native link per article row. The
image supports the title and summary without dominating either.

Use square thumbnails at approximately 160 CSS pixels on desktop and 80–96
CSS pixels on phones. Keep thumbnail and text side by side on phones instead
of stacking a large image above the copy. Align the image with the start of
the text and use a modest gap. Keep title wrapping readable and summaries in
the remaining flexible column. Allow that column to shrink without causing
horizontal document overflow. Use the same compact image treatment for the
original buying-guide entry, rather than retaining a large image spotlight.

Give every list entry a full-width divider and clear padding above and below
the image-and-text row. Use the established border token. Keep approximately
2rem vertical row padding on desktop and 1.5rem on phones, adjusting only as
needed for the existing type scale. These boundaries separate complete
articles. Avoid nested dividers, rounded cards, a card grid, or animation.

## Separate index assets from article heroes

Add an optional `thumbnail` object to the `procurementGuides` schema with the
same fields and Astro `image()` resolution as `hero`: `image`, descriptive
`alt`, and generated-illustration `caption`. If supplied, all fields are
required. On the index, select `thumbnail ?? hero` for each article. Entries
with neither object remain ordinary text links without an empty image slot.

Create distinct square photographic editorial scenes designed to be
recognisable at 80px. Give each image a dominant concrete subject or action
and no more than two or three supporting context cues. Vary the setting,
viewpoint, crop, lighting, and colour across the list so adjacent articles
can be distinguished quickly. Avoid repeating the same ivory backdrop or
presenting every subject as an isolated studio object.

Use realistic materials and recognisable procurement activities. Hands and
people may appear when the action benefits from them; keep the action large
enough to read at thumbnail size. A restrained blue packing bench or green
workshop backdrop may distinguish a scene while wood, kraft, stone, and
metal connect it with the subject matter. Keep the site's existing page
palette and layout unchanged.

The original buying guide shows a finished walnut kitchen with packed
cabinetry in the foreground. The first five article scenes show a technician
checking a cabinet hinge at a factory bench; an overhead carton, calculator,
and cost-note arrangement; a buyer using a laptop with recognisable furniture
product thumbnails; a small brass-handle shipment on a blue packing bench;
and hands checking a wood edge with a caliper against a green workshop
backdrop. Later articles use their own concrete settings and viewpoints.

Use full-size real-world scenes rather than miniature models, abstract
symbols, or collages. Exclude logos, legible text, certificates, purported
test results, and fabricated evidence. Laptop imagery may show a generic
unbranded furniture-shopping interface with actual product pictures; it
must not imitate a named marketplace or be presented as a real screenshot.
Every scene remains explicitly disclosed as generated imagery.

Save originals and generation records, and commit optimised local assets
named `<article-slug>-thumbnail.webp` alongside their article's image files.
The original guide's index thumbnail is imported directly because that guide
is not a collection entry. Do not introduce a second content registry.

Article routes continue to pass and render `hero` only. Their visible hero,
Open Graph image and alt, Article JSON-LD, and the original guide's Wood
fallback stay unchanged. A thumbnail must never silently replace these.

Use Astro's `Image` component with explicit square dimensions and small
responsive variants appropriate to 80–160px display sizes, including high
density screens. Lazy-load images below the first entry. Keep source image
subjects centred and use a square object-fit crop.

Alt text and stored captions begin with generated-illustration disclosure.
Keep visible disclosure concise so a long caption does not overwhelm an
80px thumbnail. A shared visible generated-illustration notice for the list
can replace repeated long scene captions, while each image retains its own
descriptive alt text and generation record. Give each row one keyboard stop
and use its heading as the accessible link name. Do not add image-only links.

## Review and deployment

The foundation PR owns the index rendering, this design, and focused coverage.
The fifteen article PRs continue owning their individual text, hero and
thumbnail assets, frontmatter, and generation records. The foundation owns
the original buying-guide index thumbnail. Keep them independently reviewable.

Push the existing combined preview branch and open a draft PR against `dev`
to activate the established `pages-preview-ref` workflow and Cloudflare Git
build. Its combined diff is a review preview; the individual PRs remain the
content review units. Use the generated `pr-N.harpa-pro.pages.dev` URL.
Do not merge any branch or alter the production deployment.

Verify the deployment marker matches the exact combined commit and `pr-N`
branch, then confirm all fifteen article routes, their distinct images, index
thumbnails, and downloads on that remote origin. A successful response from
an older deployment does not complete the task.

## Validation

Run site lint, typecheck, unit tests, production build, and the existing
Chromium browser suite. Check custom thumbnail selection and asset delivery;
the existing optional image contract retains hero fallback and text-only rows.
Verify article heroes and their social and structured-data images stay
unchanged when a thumbnail is supplied. Confirm compact image dimensions and
side-by-side rows at desktop and phone sizes, clear dividers and padding,
recognisable subjects, scene variety, focus, text readability, and no
document overflow. Review thumbnails together at their actual compact size
to catch repetitive composition or scenes whose action becomes unclear.
Save screenshots under `~/Pictures/Screenshots/Codex/harpa-pro/`.
