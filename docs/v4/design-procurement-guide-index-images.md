# Procurement guide index images and combined preview

## Purpose

Show the generated article illustrations on `/procurement/guides` and provide
one Cloudflare preview containing the complete fifteen-article series. Build
on the [article series](design-procurement-article-series.md) and
[article image contract](design-procurement-article-images.md).

## Index composition

Keep the current title, introductory copy, buying-guide spotlight, article
order, typography, and material palette. Add the original Wood image to the
buying-guide spotlight. Each article row uses its own `hero.image`, `alt`, and
generated-image caption from frontmatter. Do not create an image registry or
generate more illustrations.

Use an editorial list with one linked row per article. At desktop and tablet
widths, show a restrained landscape image beside the title and summary. Stack
the image above the text on phones. Keep the original list's generous spacing,
without adding a card grid, client-side filters, or animation.

Use Astro's `Image` component for responsive WebP thumbnails, explicit image
dimensions, and lazy loading below the introductory spotlight. Captions retain
generated-image disclosure. Give each row one keyboard stop and use its
heading as the accessible link name. Rows without optional hero metadata
remain ordinary text links without a placeholder or empty image column.

## Review and deployment

The foundation PR owns the index rendering, this design, and focused coverage.
The fifteen article PRs continue owning their individual text, assets, and
generation records. Keep them independently reviewable.

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
Chromium browser suite. Extend article checks to compare index image alt text
with the corresponding page image. Inspect desktop and phone screenshots for
image crops, caption wrapping, focus, text readability, and document overflow.
Save screenshots under `~/Pictures/Screenshots/Codex/harpa-pro/`.
