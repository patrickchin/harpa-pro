# Unified public site documentation implementation plan

> **Historical plan:** This records the original unified-site implementation.
> The current nine-guide hierarchy and screenshot revision are specified in
> [`plan-public-site-docs-task-first.md`](plan-public-site-docs-task-first.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stale standalone documentation deployment with current
v4 product guides at `harpapro.com/docs` inside the renamed `apps/site` Astro
application.

**Architecture:** Rename the existing Astro marketing application to the
general-purpose public site, delete the unused Next.js docs placeholder, and
render typed MDX documentation through Astro content collections. One static
build deploys to the existing Cloudflare Pages project, with local search,
legacy redirects, and test/build gates covering content accuracy and routes.

**Tech Stack:** Astro 5, MDX content collections, React 19 island, Tailwind CSS
4, Vitest, Playwright, Lighthouse CI, Cloudflare Pages, pnpm/Turbo.

---

## File structure

The implementation keeps responsibilities separated as follows:

- `apps/site/src/content/docs/*.mdx` owns user-facing guide copy.
- `apps/site/src/lib/docs.ts` owns categories, sorting, slugs, and redirect
  metadata shared by pages and tests.
- `apps/site/src/lib/docs-search.ts` owns the framework-independent local
  search algorithm.
- `apps/site/src/components/docs/` owns docs-only navigation and search UI.
- `apps/site/src/layouts/DocsLayout.astro` owns the documentation shell.
- `apps/site/src/pages/docs/` owns the index and generated guide routes.
- `apps/site/src/pages/robots.txt.ts`, `sitemap.xml.ts`, and `404.astro` own
  public discovery and failure routes.
- `apps/site/tests/` owns Playwright browser coverage.
- `.github/workflows/site-*.yml` owns preview, development, and production
  deployments for the unified site.
- `docs/marketing/deploy-cloudflare-pages.md` remains the existing operations
  runbook but is rewritten for the renamed public app and docs-host cutover.

## Task 1: Rename the public application and remove the placeholder

**Files:**

- Rename: `apps/marketing/` to `apps/site/`
- Delete: `apps/docs/`
- Rename: `.github/workflows/marketing-preview.yml` to
  `.github/workflows/site-preview.yml`
- Rename: `.github/workflows/marketing-dev.yml` to
  `.github/workflows/site-dev.yml`
- Rename: `.github/workflows/marketing-prod.yml` to
  `.github/workflows/site-prod.yml`
- Modify: `apps/site/package.json`
- Modify: `apps/site/src/__tests__/smoke.test.ts`
- Modify: `package.json`
- Modify: `lighthouserc.json`
- Modify: `.github/actions/changed-paths/action.yml`
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `scripts/gen-icons.mjs`
- Modify: app comments that still point at `apps/marketing`
- Modify: `pnpm-lock.yaml`

- [x] **Step 1: Change the smoke assertion first**

Update the package-name test to make the rename observable before changing
the package:

```ts
describe('site smoke', () => {
  it('package name is @harpa/site', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(here, '../../package.json'), 'utf8'),
    ) as { name: string };
    expect(pkg.name).toBe('@harpa/site');
  });
});
```

- [x] **Step 2: Run the focused test and confirm the expected failure**

Run:

```bash
corepack pnpm --filter @harpa/marketing test -- src/__tests__/smoke.test.ts
```

Expected: FAIL because the package is still named `@harpa/marketing`.

- [x] **Step 3: Rename the app, package, and workflows**

Use `git mv` for tracked directories/files, remove the seven-file Next.js
placeholder, and update live references so the supported commands become:

```json
{
  "name": "@harpa/site",
  "scripts": {
    "dev": "astro dev --port 3002",
    "build": "astro build",
    "preview": "astro preview --port 3002",
    "typecheck": "astro check",
    "lint": "eslint . --ext .ts,.tsx,.astro --max-warnings=0",
    "test": "vitest run"
  }
}
```

The root docs E2E entry becomes:

```json
"test:docs:e2e": "pnpm --filter @harpa/site test:e2e"
```

The changed-path composite action exposes one `site` output matching
`apps/site/**`; remove the separate placeholder-only `docs` output. Change
Lighthouse's `staticDistDir` to `apps/site/dist`.

- [x] **Step 4: Refresh the lockfile with the repository pnpm version**

Run only after package-install permission is confirmed:

```bash
corepack pnpm install --lockfile-only
```

Expected: the importer is `apps/site`; there are no `apps/marketing` or
`apps/docs` importers.

- [x] **Step 5: Verify the rename**

Run:

```bash
corepack pnpm --filter @harpa/site test -- src/__tests__/smoke.test.ts
rg -n "apps/marketing|@harpa/marketing|apps/docs|@harpa/docs" \
  apps package.json .github lighthouserc.json .env.example docker-compose.yml \
  scripts
```

Expected: the test passes and the search returns no live-code references.

- [x] **Step 6: Commit the mechanical rename**

```bash
git add apps package.json pnpm-lock.yaml lighthouserc.json .github \
  .env.example docker-compose.yml scripts
git commit -m "refactor(site): unify public web app"
```

## Task 2: Add the typed documentation model and validation tests

**Files:**

- Modify: `apps/site/src/content.config.ts`
- Create: `apps/site/src/lib/docs.ts`
- Create: `apps/site/src/__tests__/docs-content.test.ts`

- [x] **Step 1: Write failing tests for the documentation model**

Create tests for category identity, slug normalization, and redirect-map
uniqueness. Full guide-corpus assertions are added immediately before the
guides in Task 5, so this task can finish green:

```ts
it('normalizes ordered content ids to public slugs', () => {
  expect(guideSlug('01-getting-started.mdx')).toBe('getting-started');
});

it('keeps categories and redirect paths unique', () => {
  expect(new Set(DOCS_CATEGORIES.map(({ id }) => id)).size).toBe(
    DOCS_CATEGORIES.length,
  );
  const targets = Object.values(LEGACY_DOC_REDIRECTS);
  expect(new Set(targets).size).toBe(targets.length);
});
```

- [x] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
corepack pnpm --filter @harpa/site test -- src/__tests__/docs-content.test.ts
```

Expected: FAIL because `docs.ts` and the guide collection do not exist.

- [x] **Step 3: Define categories, slug helpers, and redirects**

Create the framework-independent model:

```ts
export const DOCS_CATEGORIES = [
  { id: 'start', label: 'Start here' },
  { id: 'reporting', label: 'Daily reporting' },
  { id: 'collaboration', label: 'Collaboration' },
  { id: 'account', label: 'Account and support' },
] as const;

export type DocsCategory = (typeof DOCS_CATEGORIES)[number]['id'];

export const LEGACY_DOC_REDIRECTS = {
  '/guides/getting-started': '/docs/guides/getting-started',
  '/guides/projects': '/docs/guides/projects-and-history',
  '/guides/reports': '/docs/guides/managing-reports',
  '/guides/notes': '/docs/guides/capturing-notes',
  '/guides/generate': '/docs/guides/ai-generation',
  '/guides/edit': '/docs/guides/editing-reports',
  '/guides/export': '/docs/guides/finalize-export-share',
  '/guides/collaboration': '/docs/guides/project-members',
  '/guides/account': '/docs/guides/account-and-usage',
} as const;

export function guideSlug(id: string): string {
  return id.replace(/\.(md|mdx)$/, '').replace(/^\d+-/, '');
}
```

- [x] **Step 4: Add the Astro collection schema**

Add a `docs` glob collection with this contract:

```ts
const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    category: z.enum(['start', 'reporting', 'collaboration', 'account']),
    order: z.number().int().positive(),
    keywords: z.array(z.string().min(1)).min(1),
    lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    related: z.array(z.string()).default([]),
    screenshot: z.string().startsWith('/').optional(),
  }),
});

export const collections = { faq, features, roadmap, docs };
```

- [x] **Step 5: Re-run the focused test**

Run:

```bash
corepack pnpm --filter @harpa/site test -- src/__tests__/docs-content.test.ts
```

Expected: PASS for the model and schema helpers.

## Task 3: Implement local search test-first

**Files:**

- Create: `apps/site/src/lib/docs-search.ts`
- Create: `apps/site/src/lib/docs-search.test.ts`
- Create: `apps/site/src/components/docs/DocsSearch.tsx`

- [x] **Step 1: Write ranking and empty-query tests**

```ts
it('returns all guides for an empty query', () => {
  expect(searchGuides(entries, '')).toEqual(entries);
});

it('ranks title matches before keyword and description matches', () => {
  expect(searchGuides(entries, 'voice').map((entry) => entry.slug)).toEqual([
    'voice-notes',
    'capturing-notes',
    'getting-started',
  ]);
});

it('matches case-insensitively and returns an empty array for no match', () => {
  expect(searchGuides(entries, 'PDF')[0]?.slug).toBe('finalize-export-share');
  expect(searchGuides(entries, 'fax machine')).toEqual([]);
});
```

- [x] **Step 2: Run the tests and confirm they fail**

Run:

```bash
corepack pnpm --filter @harpa/site test -- src/lib/docs-search.test.ts
```

Expected: FAIL because `searchGuides` is missing.

- [x] **Step 3: Implement the pure search function**

```ts
export interface DocsSearchEntry {
  slug: string;
  title: string;
  description: string;
  category: string;
  categoryLabel: string;
  keywords: string[];
}

export function searchGuides(
  entries: readonly DocsSearchEntry[],
  rawQuery: string,
): DocsSearchEntry[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return [...entries];
  return entries
    .map((entry, index) => {
      const title = entry.title.toLocaleLowerCase();
      const keywords = entry.keywords.join(' ').toLocaleLowerCase();
      const description = entry.description.toLocaleLowerCase();
      const score =
        (title.includes(query) ? 30 : 0) +
        (keywords.includes(query) ? 20 : 0) +
        (description.includes(query) ? 10 : 0);
      return { entry, score, index };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ entry }) => entry);
}
```

- [x] **Step 4: Build the accessible React search island**

`DocsSearch` renders the full server-side guide list, filters it after
hydration, associates a visible label with the search input, announces result
counts using `aria-live="polite"`, and shows links to category navigation plus
`mailto:patrick@harpapro.com` when no guides match. It does not import or call
any analytics API.

- [x] **Step 5: Re-run search tests and commit the model/search unit**

```bash
corepack pnpm --filter @harpa/site test -- \
  src/lib/docs-search.test.ts src/__tests__/docs-content.test.ts
git add apps/site/src/content.config.ts apps/site/src/lib \
  apps/site/src/components/docs/DocsSearch.tsx \
  apps/site/src/__tests__/docs-content.test.ts
git commit -m "feat(site): add docs content model and search"
```

Expected: all current site unit tests pass.

## Task 4: Build the documentation shell and routes

**Files:**

- Create: `apps/site/src/components/docs/DocsSidebar.astro`
- Create: `apps/site/src/components/docs/DocsPager.astro`
- Create: `apps/site/src/layouts/DocsLayout.astro`
- Create: `apps/site/src/pages/docs/index.astro`
- Create: `apps/site/src/pages/docs/guides/[...slug].astro`
- Modify: `apps/site/src/components/landing/Header.astro`
- Modify: `apps/site/src/components/landing/Footer.astro`
- Modify: `apps/site/src/styles/globals.css`

- [x] **Step 1: Add shell assertions before the routes exist**

Extend `docs-content.test.ts` to assert that both docs routes and their layout
exist and that the site header no longer points to the old host:

```ts
expect(existsSync(resolve(srcRoot, 'pages/docs/index.astro'))).toBe(true);
expect(existsSync(resolve(srcRoot, 'pages/docs/guides/[...slug].astro'))).toBe(true);
expect(existsSync(resolve(srcRoot, 'layouts/DocsLayout.astro'))).toBe(true);
expect(readFileSync(resolve(srcRoot, 'components/landing/Header.astro'), 'utf8'))
  .not.toContain('https://docs.harpapro.com');
```

- [x] **Step 2: Implement the shared docs layout**

`DocsLayout.astro` composes the existing `Layout`, `Header`, and `Footer`, then
adds breadcrumbs, grouped navigation, and a prose slot. Its props are:

```ts
interface Props {
  title: string;
  description: string;
  guides: CollectionEntry<'docs'>[];
  currentSlug?: string;
  category?: DocsCategory;
}
```

The desktop sidebar is sticky below the site header. Mobile uses a native
`<details>` element so guide navigation remains functional without JavaScript.

- [x] **Step 3: Implement the index route**

The index loads and sorts guides, maps them to `DocsSearchEntry`, and renders:

```astro
<DocsLayout
  title="Harpa Pro guides"
  description="Current guides for capturing site activity and producing reports with Harpa Pro."
  guides={guides}
>
  <h1>Harpa Pro guides</h1>
  <p>Set up the iPhone app, capture the day, and finish a report.</p>
  <DocsSearch entries={searchEntries} client:load />
</DocsLayout>
```

- [x] **Step 4: Implement generated guide routes**

`[...slug].astro` uses `getStaticPaths()` over the docs collection, renders
the selected MDX entry, and passes adjacent entries to `DocsPager`. Unknown
slugs fall through to the static 404 page at the host.

- [x] **Step 5: Add docs styling without changing marketing behavior**

Add focused component-layer classes for a maximum 72-character reading width,
visible focus rings, 44-pixel mobile controls, responsive two-column layout,
ordered steps, callouts, tables, inline code, and screenshots. Reuse only the
existing semantic color tokens.

- [x] **Step 6: Point global navigation at the canonical route**

Both desktop and mobile header links use `/docs`. The footer adds a `/docs`
link between Roadmap and Privacy.

- [x] **Step 7: Run type/lint checks for the shell**

```bash
corepack pnpm --filter @harpa/site typecheck
corepack pnpm --filter @harpa/site lint
```

Expected: both pass once Task 5 content exists; before then Astro reports the
empty collection only if route typing requires entries.

## Task 5: Write and verify all v4 guides

**Files:**

- Create: `apps/site/src/content/docs/01-getting-started.mdx`
- Create: `apps/site/src/content/docs/02-projects-and-history.mdx`
- Create: `apps/site/src/content/docs/03-managing-reports.mdx`
- Create: `apps/site/src/content/docs/04-capturing-notes.mdx`
- Create: `apps/site/src/content/docs/05-ai-generation.mdx`
- Create: `apps/site/src/content/docs/06-editing-reports.mdx`
- Create: `apps/site/src/content/docs/07-finalize-export-share.mdx`
- Create: `apps/site/src/content/docs/08-project-members.mdx`
- Create: `apps/site/src/content/docs/09-account-and-usage.mdx`
- Create: `apps/site/src/content/docs/10-account-deletion-and-help.mdx`

- [x] **Step 1: Add and run the failing guide-corpus contract**

Extend `docs-content.test.ts` to require ten unique guides, resolve every
related slug and screenshot, require every legacy redirect target, and reject
stale terminology:

```ts
const PROHIBITED = [
  /phone number/i,
  /text message/i,
  /\bSMS\b/i,
  /\bAdmin\b/,
  /dedicated Edit tab/i,
  /server-generated PDF/i,
  /available on Android/i,
];

expect(files).toHaveLength(10);
const routes = new Set(
  files.map((file) => `/docs/guides/${guideSlug(basename(file))}`),
);
for (const target of Object.values(LEGACY_DOC_REDIRECTS)) {
  expect(routes.has(target), target).toBe(true);
}
for (const pattern of PROHIBITED) expect(corpus).not.toMatch(pattern);
```

Run:

```bash
corepack pnpm --filter @harpa/site test -- src/__tests__/docs-content.test.ts
```

Expected: FAIL because the guide directory is still empty.

- [x] **Step 2: Use the same validated frontmatter shape in every guide**

Each file uses inline arrays so Astro and the validation tests read the same
data:

```yaml
---
title: "Getting started"
description: "Install Harpa Pro, sign in by email, and create your first project."
category: "start"
order: 1
keywords: ["install", "iphone", "email", "otp", "project"]
lastVerified: "2026-07-03"
related: ["projects-and-history", "managing-reports"]
---
```

- [x] **Step 3: Write guides against explicit product sources**

Use these required sections and sources; do not copy v3 docs:

| Guide | Required sections | Current source of truth |
| --- | --- | --- |
| Getting started | iPhone availability, email OTP, first project | `apps/mobile/app/(auth)/sign-in/`, project routes |
| Projects and history | project list, create/edit/delete, report history | project screens and routes |
| Managing reports | create, open, report states, delete | report routes and screens |
| Capturing notes | text, photo, batch photo, document, voice, note options | note composer, upload, camera, voice features |
| AI generation | generate, automatic regeneration, retry, usage limits | generate route and `useAutoRegenerate.ts` |
| Editing reports | per-card pencil actions, save, unfinalize before editing | generated/final report screens |
| Finalize/export/share | finalize, preview, save/open/share on-device PDF | `export-report-pdf.ts`, saved report screen |
| Project members | invite by email, Owner/Editor/Viewer abilities | `project-members.tsx`, member API contract |
| Account and usage | name/email, usage limits/history, privacy, cache, sign-out | profile and usage routes |
| Account deletion/help | in-app deletion, web fallback, troubleshooting/support | account deletion route/design and public legal page |

Every guide contains a short purpose, numbered steps, a "Good to know" block,
troubleshooting guidance, and related links. State that Android/web are planned
where platform availability is relevant.

- [x] **Step 4: Run the content contract tests**

```bash
corepack pnpm --filter @harpa/site test -- src/__tests__/docs-content.test.ts
```

Expected: all ten guides, references, assets, redirects, and prohibited-term
checks pass.

- [x] **Step 5: Build the static site and inspect generated routes**

```bash
corepack pnpm --filter @harpa/site build
find apps/site/dist/docs -maxdepth 3 -type f | sort
```

Expected: `/docs/index.html` plus ten guide `index.html` files.

- [x] **Step 6: Commit the documentation experience**

```bash
git add apps/site/src/content apps/site/src/components/docs \
  apps/site/src/layouts/DocsLayout.astro apps/site/src/pages/docs \
  apps/site/src/styles/globals.css apps/site/src/components/landing
git commit -m "feat(site): publish current product guides"
```

## Task 6: Add discovery, compatibility, and failure routes

**Files:**

- Create: `apps/site/src/pages/404.astro`
- Create: `apps/site/src/pages/robots.txt.ts`
- Create: `apps/site/src/pages/sitemap.xml.ts`
- Create: `apps/site/public/_redirects`
- Modify: `apps/site/src/layouts/Layout.astro`
- Modify: `apps/site/src/__tests__/smoke.test.ts`

- [x] **Step 1: Write failing metadata and redirect assertions**

The smoke test must require the generated routes and every legacy map entry:

```ts
it('publishes discovery and compatibility routes', () => {
  expect(existsSync(resolve(here, '../../src/pages/404.astro'))).toBe(true);
  expect(existsSync(resolve(here, '../../src/pages/robots.txt.ts'))).toBe(true);
  expect(existsSync(resolve(here, '../../src/pages/sitemap.xml.ts'))).toBe(true);
  const redirects = readFileSync(resolve(here, '../../public/_redirects'), 'utf8');
  for (const [from, to] of Object.entries(LEGACY_DOC_REDIRECTS)) {
    expect(redirects).toContain(`${from} ${to} 301`);
  }
});
```

- [x] **Step 2: Run the smoke test and confirm it fails**

```bash
corepack pnpm --filter @harpa/site test -- src/__tests__/smoke.test.ts
```

Expected: FAIL because the discovery routes do not exist.

- [x] **Step 3: Add discovery and error responses**

`robots.txt.ts` allows crawling and names
`https://harpapro.com/sitemap.xml`. `sitemap.xml.ts` emits XML for the static
public routes and all docs guides using `Astro.site`. `404.astro` uses the
shared site shell and links to `/`, `/docs`, and email support.

- [x] **Step 4: Add path redirects and metadata behavior**

Generate `public/_redirects` from the approved legacy map. Keep canonical and
Open Graph URL construction in `Layout.astro`; add an optional `noindex` prop
used by the 404 page. Do not add query capture or search analytics.

- [x] **Step 5: Re-run smoke, typecheck, and build**

```bash
corepack pnpm --filter @harpa/site test -- src/__tests__/smoke.test.ts
corepack pnpm --filter @harpa/site typecheck
corepack pnpm --filter @harpa/site build
```

Expected: all commands pass and discovery files exist in `apps/site/dist`.

## Task 7: Add Playwright and CI gates

**Files:**

- Modify: `apps/site/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/site/playwright.config.ts`
- Create: `apps/site/tests/docs.spec.ts`
- Modify: `.github/workflows/site-preview.yml`
- Modify: `.github/workflows/site-dev.yml`
- Modify: `.github/workflows/site-prod.yml`
- Modify: `lighthouserc.json`

- [x] **Step 1: Add the site-scoped Playwright dependency**

After explicit package-install approval:

```bash
corepack pnpm --filter @harpa/site add -D @playwright/test@^1.51.1
```

Add scripts:

```json
"test:e2e": "playwright test",
"test:e2e:headed": "playwright test --headed"
```

- [x] **Step 2: Write browser tests before their final wiring**

The Playwright suite covers:

```ts
test('searches guides without leaving the docs index', async ({ page }) => {
  await page.goto('/docs');
  await page.getByLabel('Search guides').fill('voice');
  await expect(page.getByRole('link', { name: /capturing notes/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /project members/i })).toBeHidden();
});

test('renders a guide and traverses related navigation', async ({ page }) => {
  await page.goto('/docs/guides/getting-started');
  await expect(page.getByRole('heading', { level: 1, name: 'Getting started' })).toBeVisible();
  await page.getByRole('link', { name: /next/i }).click();
  await expect(page).toHaveURL(/projects-and-history/);
});

test('keeps docs usable at a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/guides/capturing-notes');
  await page.getByText('Browse guides').click();
  await expect(page.getByRole('link', { name: 'AI generation' })).toBeVisible();
});
```

Also crawl every same-origin link from `/docs` and assert responses are below
400; request every image and assert a successful response; verify an unknown
guide uses the branded 404 page.

- [x] **Step 3: Configure a production-like local server**

Use Chromium with `baseURL: http://127.0.0.1:3002`, trace/screenshot on first
retry, and a web server command that builds then runs `astro preview`:

```ts
webServer: {
  command: 'corepack pnpm build && corepack pnpm preview --host 127.0.0.1',
  url: 'http://127.0.0.1:3002/docs',
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
}
```

- [x] **Step 4: Run Playwright**

```bash
corepack pnpm --filter @harpa/site exec playwright install chromium
corepack pnpm --filter @harpa/site test:e2e
```

Expected: all desktop, mobile, search, link, asset, redirect, and 404 tests
pass.

- [x] **Step 5: Wire preview and deploy workflows**

The preview workflow targets pull requests to both `dev` and `main`, filters
on `apps/site/**`, runs site tests/typecheck/build/Playwright, runs Lighthouse,
and deploys `apps/site/dist`. Dev/prod deploy workflows use renamed labels,
paths, filter/package names, output paths, and workflow concurrency groups.

Add `/docs/` to Lighthouse's URL list while preserving the current score
thresholds.

- [x] **Step 6: Commit the quality gates**

```bash
git add apps/site/package.json apps/site/playwright.config.ts \
  apps/site/tests pnpm-lock.yaml .github/workflows/site-*.yml \
  lighthouserc.json apps/site/src/pages apps/site/public/_redirects \
  apps/site/src/layouts/Layout.astro apps/site/src/__tests__/smoke.test.ts
git commit -m "test(site): gate docs routes and deployment"
```

## Task 8: Update operations and architecture documentation

**Files:**

- Modify: `apps/site/README.md`
- Modify: `docs/marketing/README.md`
- Modify: `docs/marketing/deploy-cloudflare-pages.md`
- Modify: `docs/marketing/plan-m0-foundation.md`
- Modify: `docs/marketing/plan-m1-waitlist.md`
- Modify: `docs/marketing/plan-m2-voice-demo.md`
- Modify: `docs/marketing/plan-m3-launch.md`
- Modify: `docs/marketing/prompts/start-marketing-m0.md`
- Modify: `docs/marketing/prompts/start-marketing-m1.md`
- Modify: `docs/v4/arch-ops.md`
- Modify: `docs/v4/arch-testing.md`
- Modify: `docs/v4/arch-cicd-and-migrations.md`
- Modify: `docs/v4/arch-shared-packages.md`
- Modify: `docs/v4/arch-voice-pipeline.md`
- Modify: `docs/v4/plan-p0-foundation.md`
- Modify: `docs/v4/pitfalls.md`
- Modify: affected bug-log references

- [x] **Step 1: Update supported commands and architecture**

Document `apps/site`, `@harpa/site`, `/docs`, the one-build topology, the three
renamed workflows, Playwright coverage, and Cloudflare Pages project
`harpa-pro`. Historical plan prose may retain the word "marketing" as a product
area, but no command or current path may point to `apps/marketing`.

- [x] **Step 2: Write the exact cutover and rollback runbook**

Use current official Cloudflare documentation to record the supported Single
Redirect expression or wildcard rule for:

```text
docs.harpapro.com/<legacy-path> -> harpapro.com/docs/<mapped-path>
```

The runbook must include:

1. Verify PR and dev deployments.
2. Verify the production `/docs` routes after protected promotion to `main`.
3. Export the existing Vercel project/domain settings for rollback.
4. Move `docs.harpapro.com` DNS/proxy handling to Cloudflare.
5. Apply the hostname rule and test root, known, unknown, and query-string URLs.
6. Monitor 4xx responses and TLS.
7. Retire Vercel only after the rollback window.
8. Roll back by restoring the previous Vercel DNS record and disabling the
   redirect rule.

- [x] **Step 3: Search for stale operational references**

```bash
rg -n "apps/marketing|@harpa/marketing|marketing-(preview|dev|prod)\.yml|apps/docs|@harpa/docs|Vercel \(or Cloudflare Pages" \
  --glob '!docs/v4/design-public-site-docs.md' \
  --glob '!docs/v4/plan-public-site-docs.md' .
```

Expected: no stale supported paths, commands, workflows, or hosting statements.

- [x] **Step 4: Commit matching documentation**

```bash
git add apps/site/README.md docs .env.example docker-compose.yml \
  apps/mobile scripts
git commit -m "docs(site): document unified hosting and cutover"
```

## Task 9: Final verification and handoff

**Files:**

- Modify: `docs/v4/plan-public-site-docs.md` (check completed tasks)

- [x] **Step 1: Run focused unit and content tests**

```bash
corepack pnpm --filter @harpa/site test
```

Expected: all site Vitest suites pass.

- [x] **Step 2: Run static analysis**

```bash
corepack pnpm --filter @harpa/site lint
corepack pnpm --filter @harpa/site typecheck
```

Expected: zero errors and zero warnings.

- [x] **Step 3: Run production build and browser verification**

```bash
corepack pnpm --filter @harpa/site build
corepack pnpm --filter @harpa/site test:e2e
corepack pnpm exec lhci autorun --config=./lighthouserc.json
```

Expected: static build, Playwright, and Lighthouse thresholds pass.

- [x] **Step 4: Run repository consistency checks**

```bash
git diff --check
rg -n "apps/marketing|@harpa/marketing|apps/docs|@harpa/docs" \
  --glob '!docs/v4/design-public-site-docs.md' \
  --glob '!docs/v4/plan-public-site-docs.md' .
git status --short
```

Expected: no whitespace errors, no stale supported references, and only the
intended plan-checkbox update remains.

- [x] **Step 5: Commit the completed plan state**

```bash
git add docs/v4/plan-public-site-docs.md
git commit -m "docs(site): complete public docs rebuild"
```

- [x] **Step 6: Report release boundaries clearly**

Handoff states that code and preview/deploy configuration are complete, but
production promotion, Cloudflare DNS/redirect changes, and Vercel retirement
must follow the protected release and cutover runbook. Do not claim the public
hostname moved until those external steps have been executed and verified.
