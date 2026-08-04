# Public site and documentation design

Status: approved on 2026-07-03; guide hierarchy and initial screenshot
revision approved on 2026-07-03; contextual screenshot layout approved on
2026-08-05.

## Context

The public documentation at `docs.harpapro.com` was a manually deployed
Next.js build from an older codebase. At the time of this decision, the
current repository contained only a placeholder under `apps/docs`, so the
live site had drifted from the v4 product. Its instructions still described
SMS authentication, Admin roles, a dedicated report Edit tab, manual-only
regeneration, and server-generated PDFs.

The current marketing app is an Astro static site deployed to the Cloudflare
Pages project `harpa-pro`. It already owns the Harpa Pro public design system,
legal pages, roadmap, release workflows, and the canonical
`https://harpapro.com` domain.

## Decision

Rename `apps/marketing` to `apps/site` and its workspace package from
`@harpa/marketing` to `@harpa/site`. The app becomes the single public Harpa
Pro site for marketing, roadmap, legal pages, and product documentation.

Rebuild the documentation as Astro content inside `apps/site` and publish it
at `https://harpapro.com/docs`. Remove the obsolete `apps/docs` Next.js
placeholder. Continue deploying one static output to the existing Cloudflare
Pages project `harpa-pro`.

After production verification, redirect `docs.harpapro.com` to
`harpapro.com/docs` at the Cloudflare zone. Preserve the legacy path where a
known equivalent exists. Retire the old Vercel project only after the redirect
and canonical site have been verified.

## Alternatives considered

### Combine separate build outputs

Keeping Astro and Next.js as separate apps and merging their outputs before a
Cloudflare deployment would preserve framework separation. It would also add
fragile routing, asset-prefix, build-order, preview, and caching behavior for
no product benefit.

### Extract a shared documentation package

A shared `packages/docs-content` package would isolate content from rendering,
but there is no second consumer. Astro content collections already provide a
typed boundary, so another package would be unnecessary abstraction.

## Information architecture

The documentation uses an Astro content collection rooted at
`apps/site/src/content/docs`. Each guide has validated metadata for:

- title and description;
- tier and display order;
- search keywords;
- last-verified date;
- optional related-guide slugs.

`/docs` is the searchable guide index. Individual guides use
`/docs/guides/<slug>`. The hierarchy follows the original documentation site
more closely while updating every instruction for v4.

### Core workflows

1. Generate an AI report.
2. Export and share a PDF.

### Everyday tasks

1. Create and manage projects.
2. Capture notes, photos, and voice notes.
3. Add members to a project.
4. Edit a report manually.
5. Browse and reopen saved reports.

### Setup and account

1. Getting started.
2. Your account.

Account deletion, usage, privacy, cache controls, and sign-out are concise
sections inside **Your account**. The dedicated account-deletion legal route
remains available outside the guide collection.

Core workflow guides contain no more than five steps and 450 words. Smaller
task guides contain three or four steps and no more than 300 words. Tips and
troubleshooting appear only when they prevent a likely user failure. Guides do
not repeat product background, platform caveats, or generic "Good to know"
material.

Guide copy is verified against the current mobile implementation and v4
architecture documents. The build rejects stale claims about SMS login,
Admin roles, a dedicated Edit tab, manual-only regeneration, server-generated
PDFs, or public Android availability.

## User experience

The docs reuse the public site's warm-paper, navy, and orange design tokens,
Inter typography, wordmark, header, footer, focus treatment, and responsive
conventions. The index restores the original task-first presentation:

- the heading **What do you want to do?** with local guide search;
- a shallow three-stage visual strip for capture, report review, and PDF
  sharing;
- two large core-workflow cards;
- smaller everyday-task cards;
- de-emphasized setup and account links;
- local search as a supporting control rather than the primary hierarchy.

The documentation layout adds:

- tiered navigation on desktop;
- accessible mobile navigation;
- breadcrumbs;
- previous and next guide links;
- related guides;
- numbered step cards and contextual screenshot crops.

Guide headings are text-only at every breakpoint. They do not reserve a
second column for a full-height phone screenshot, so the first task starts
immediately after the title and description.

The docs index presents screenshots as three shallow cards beneath the intro
and search. The cards represent **Capture updates**, **Review the report**, and
**Share a PDF**. They form one horizontal strip on wider screens and stack as
compact cards on narrow screens. The strip supports the task hierarchy; it
does not replace or delay the core workflow links.

When a guide step benefits from an image, the screenshot appears beside or
below that step as a wide crop focused on the relevant control or content.
Each crop links to the complete portrait capture with contextual accessible
text. This full-image path uses a normal link and remains usable without
JavaScript; the first revision does not add a modal or carousel.

The core content and navigation work without JavaScript. Search is a small
client-side enhancement over a static build-time index. Search terms stay in
the browser and are not sent to analytics. No-results states suggest browsing
categories or contacting support.

Only reviewed screenshots from the current v4 app may ship. The initial
revision reuses the checked-in App Store screenshots and copies them into the
site's asset graph so the public-site build does not depend on another
workspace at deploy time. A central screenshot registry owns the focal point
used for each crop so MDX guides do not carry layout coordinates. New
task-specific captures are deferred until an important screen or crop is
missing. Old H3/v3 screenshots and generated mockups are excluded.

The initial screenshot map is:

| Guide step or surface | Screenshot |
| --- | --- |
| Docs index strip | Voice/notes capture, generated report, PDF preview |
| Generate an AI report | Projects, voice/notes, generated report |
| Export and share a PDF | PDF preview |
| Create and manage projects | Projects list |
| Capture notes, photos, and voice notes | Voice/notes capture |
| Add members to a project | Members list |
| Edit a report manually | Closest current generated-report view |
| Browse and reopen saved reports | Reports list |
| Getting started | Projects list |
| Your account | Usage history |

Every image has descriptive alt text, explicit dimensions, and lazy loading
below the fold. Every guide crop has a contextual full-capture link. A missing
referenced image or crop focus fails the content contract instead of silently
rendering a placeholder.

## Routes, metadata, and compatibility

The site provides canonical URLs, per-page descriptions, Open Graph and
Twitter metadata, a sitemap, robots rules, and a useful static 404 page.
Marketing navigation links to `/docs` instead of the old hostname.

Canonical guide slugs mirror the original task names where possible, including
`generate-ai-report`, `export-share-pdf`, `capture-notes-voice`, and
`browse-saved-reports`. Known old documentation paths receive permanent
redirects to the matching `/docs/guides/...` route. The temporary slugs from
the first pull-request revision also redirect so review links remain valid.
The Cloudflare hostname rule redirects other
`docs.harpapro.com/<path>` requests to the canonical `/docs` destination. The
cutover runbook records the exact redirect map and a rollback procedure.

## Deployment

The Cloudflare Pages project remains `harpa-pro`:

- pull requests targeting `dev` or `main` receive unique previews;
- pushes to `dev` update the stable development deployment;
- pushes to `main` update production.

Workflows, path filters, cache keys, scripts, Lighthouse configuration, and
documentation are renamed from `marketing` to `site`. Preview comments and job
labels refer to the public site.

The release order is:

1. Verify the pull-request preview.
2. Merge to `dev` and verify the stable development deployment.
3. Promote to `main` through the protected release process.
4. Verify `harpapro.com/docs`, metadata, links, and assets.
5. Apply and verify the Cloudflare hostname and legacy-path redirects.
6. Retire the Vercel project.

Production promotion, DNS changes, and Vercel retirement are explicit release
operations. Implementation does not bypass branch protection or merge directly
to `main`.

## Validation and failure behavior

Astro content schemas fail the build for invalid or missing guide metadata.
Additional tests fail on duplicate slugs, broken related-guide references,
missing local assets or alt text, prohibited stale terminology, invalid route
mappings, a guide count other than nine, a core-workflow count other than two,
or content that exceeds the approved step limits.

The quality gates are:

- Vitest content and route-map tests;
- Astro type checking;
- ESLint;
- a static production build;
- Playwright coverage for the three-tier desktop and mobile navigation, guide
  rendering, screenshots, local search, empty search results, legacy
  redirects, and missing routes;
- internal-link, fragment, and asset validation;
- the existing Lighthouse thresholds for performance, accessibility, best
  practices, and SEO.

Core docs remain usable if client-side search fails or JavaScript is disabled.
Missing guides render the site 404 page. Invalid content fails in CI rather
than producing a partially broken deployment.

## Documentation changes

Implementation updates:

- `docs/v4/arch-ops.md` with the unified public-site topology;
- the Cloudflare Pages deployment runbook with the renamed app and redirect
  cutover;
- marketing planning references whose paths or package names become stale;
- the root operational references to the docs host and release workflow.

These documentation changes ship in the same commits as the behavior they
describe.
