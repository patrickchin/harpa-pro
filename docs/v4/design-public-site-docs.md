# Public site and documentation design

Status: approved on 2026-07-03.

## Context

The public documentation at `docs.harpapro.com` is a manually deployed
Next.js build from the old `patrickchin/haru3-reports` repository. The
current repository contains only a placeholder under `apps/docs`, so the
live site has drifted from the v4 product. Its instructions still describe
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
- category and display order;
- search keywords;
- last-verified date;
- optional related-guide slugs;
- optional reviewed screenshot references.

`/docs` is the searchable guide index. Individual guides use
`/docs/guides/<slug>`. The first release covers:

1. Getting started and email OTP.
2. Projects and report history.
3. Creating and managing reports.
4. Text, photo, document, batch-photo, and voice notes.
5. AI report generation and automatic regeneration.
6. Editing report cards and unfinalizing reports.
7. Finalizing, exporting, and sharing on-device PDFs.
8. Email invitations and Owner, Editor, and Viewer roles.
9. Account details, usage limits and history, privacy, cache, and sign-out.
10. Account deletion and troubleshooting.

Guide copy is verified against the current mobile implementation and v4
architecture documents. The build rejects stale claims about SMS login,
Admin roles, a dedicated Edit tab, manual-only regeneration, server-generated
PDFs, or public Android availability.

## User experience

The docs reuse the public site's warm-paper, navy, and orange design tokens,
Inter typography, wordmark, header, footer, focus treatment, and responsive
conventions. A documentation layout adds:

- category navigation on desktop;
- accessible mobile navigation;
- breadcrumbs;
- previous and next guide links;
- related guides;
- readable prose, callout, step, and screenshot styles.

The core content and navigation work without JavaScript. Search is a small
client-side enhancement over a static build-time index. Search terms stay in
the browser and are not sent to analytics. No-results states suggest browsing
categories or contacting support.

Only reviewed screenshots from the current v4 app may ship. Existing checked-in
store screenshots can be reused where they accurately illustrate a guide. Old
H3/v3 screenshots and generated mockups are excluded.

## Routes, metadata, and compatibility

The site provides canonical URLs, per-page descriptions, Open Graph and
Twitter metadata, a sitemap, robots rules, and a useful static 404 page.
Marketing navigation links to `/docs` instead of the old hostname.

Known old documentation paths receive permanent redirects to the closest new
guide. The Cloudflare hostname rule redirects other
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
missing local assets, prohibited stale terminology, or invalid route mappings.

The quality gates are:

- Vitest content and route-map tests;
- Astro type checking;
- ESLint;
- a static production build;
- Playwright coverage for desktop and mobile navigation, guide rendering,
  local search, empty search results, legacy redirects, and missing routes;
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
