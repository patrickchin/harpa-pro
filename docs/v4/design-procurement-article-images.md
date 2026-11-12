# Procurement article images

## Purpose and baseline

Give each of the fifteen new procurement guides a distinct generated hero
image that explains its subject. Preserve the existing buying guide's Wood
material concept and the article series' layout, typography, navigation,
contents, and contact behaviour.

The implementation builds on
[`design-procurement-article-series.md`](design-procurement-article-series.md)
and the existing `ProcurementGuide.astro` layout. Article imagery is
illustrative rather than evidence of Harpa Pro projects, supplier visits,
product certification, or completed shipments.

## Content contract

Add an optional nested `hero` object to the `procurementGuides` collection:

- `image`: resolved by Astro's schema `image()` helper.
- `alt`: a required descriptive string identifying the generated scene.
- `caption`: a required visible caption that begins “Generated illustration”.

Validate the generated-disclosure prefixes in the schema, so an arbitrary
caption cannot bypass the disclosure checks. The legacy Wood fallback is
separate from the collection metadata and keeps its original caption.

Use the collection schema callback `schema: ({ image }) => ...` so local
asset references resolve to Astro `ImageMetadata` at build time. Keep the
whole object optional for backward compatibility; if supplied, all its
fields are required. Do not introduce a parallel image registry, slug map,
image IDs, or runtime fetch.

Each article references its own local WebP in
`apps/site/src/assets/procurement/guides/<article-slug>.webp`. Resolve the
relative image path from the MDX file. The article PR contains its image
and frontmatter together. Preserve original generated files under
`~/.codex/generated_images/`; the website must consume the committed asset.
Encode the selected originals as WebP using the existing Sharp dependency
to keep repository assets small. Preserve the full generated originals and
record each exact prompt in an adjacent `<article-slug>.generation.json`.

## Renderer and metadata

Extend `ProcurementGuide` with one optional `hero` prop containing the
resolved image metadata, alt text, and caption. The collection route passes
`guide.data.hero` through. In the layout, select that object or the current
Wood image/alt/caption fallback once and use the selected source consistently
for the visible hero, social image, Open Graph alt, and Article JSON-LD image.

Retain Astro's responsive `Image` component, reserved dimensions, responsive
WebP output, existing quality and priority behaviour, and current sizing
rules. Continue generating the social image through `getImage` at 1200 by
630. Preserve absolute production image URLs in Article JSON-LD and the
existing shared Layout's metadata handling. Do not attach a new image to
the reporting site or unrelated pages.

The generated originals use a landscape 3:2 composition, with the key
subject held in a crop-safe centre. Existing hero display crops and social
crop may trim the edges. Keep the current original-guide image display
unchanged. Verify the new image subjects remain clear at desktop and phone
widths and in the wider social crop.

## Art direction and disclosure

Use premium photorealistic editorial illustrations with warm natural light,
credible furniture and finish materials, and the site's restrained walnut,
limestone, and kraft palette. Compose a different scene for each article;
avoid repeating a laptop-and-paper desk across the series.

The first five images show supplier verification, a procurement budget,
buying-channel comparison, a limited trial order, and close product
inspection. The remaining images follow the specific task discussed in
their article. Subjects and tools should be plausible without implying
that the depicted paperwork or measurement establishes compliance.

Exclude brand logos, legible text, certificates, fabricated product tests,
fake interface screenshots, and visible claims about a real business.
Screen content should be abstract or out of focus. Do not depict a known
supplier, customer, completed Harpa project, or identifiable real person.

Alt text describes the scene and begins “Generated illustration of ...”.
The visible caption uses the same disclosure with a concise subject label.
Keep disclosure on the image rather than relying on a remote disclaimer.
The main article's existing byline and factual content remain separate.

## PR boundaries

Put schema, shared renderer, route plumbing, this design, and focused
coverage in the foundation PR. It must continue building with no new hero
metadata and preserve the original guide's fallback.

Update each of the fifteen article PRs with only its own image and hero
metadata. Each remains independent of the other article PRs and depends on
the shared foundation. Add no package or client-side image code. Do not
merge or publish as part of image creation.

## Validation

Run the existing site checks after schema and renderer changes. Cover both
custom hero and fallback selection, matching visible/social/structured-data
sources, and rejection of an incomplete hero object. Verify all fifteen
article images are distinct files with valid local references, non-empty
descriptive alt text, and generated-illustration captions.

Inspect every generated original before choosing it. Render representative
articles at desktop and phone widths, checking crop, reserved image size,
caption wrapping, image delivery, and layout overflow. Confirm the original
guide still shows the existing Wood concept and accurate caption. Save
browser screenshots under `~/Pictures/Screenshots/Codex/harpa-pro/`.

Keep a generation record with the prompt, tool mode, original path, committed
path, alt text, and caption for each image. The generation record supports
the PR review; it is not public article prose or proof of a real order.
