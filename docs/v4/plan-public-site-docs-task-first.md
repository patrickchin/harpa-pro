# Task-first public docs revision implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revise the public documentation into the approved nine-guide,
task-first structure and add current v4 screenshots without overwhelming new
users.

**Architecture:** Keep the existing Astro content collection and `/docs`
deployment, but replace category-based navigation with three tiers: two core
workflows, five everyday tasks, and two setup/account guides. Store the current
mobile screenshots in the site asset graph, render them through one optimized
phone-frame component, and enforce guide count, tier count, screenshots, step
limits, word limits, slugs, and redirects in tests.

**Tech stack:** Astro 5, MDX content collections, TypeScript, React search
island, Tailwind/CSS, Vitest, Playwright, Lighthouse CI, Cloudflare Pages.

**Design source:**
[`docs/v4/design-public-site-docs.md`](design-public-site-docs.md)

---

## File map

- `apps/site/src/lib/docs.ts` — tier definitions, canonical guide helpers,
  sorting, screenshot ids, and redirect maps.
- `apps/site/src/lib/docs-screenshots.ts` — static screenshot imports and the
  typed id-to-image map.
- `apps/site/src/content.config.ts` — validated guide frontmatter.
- `apps/site/src/assets/docs/*.png` — copied, reviewed v4 App Store
  screenshots; Astro optimizes them during the site build.
- `apps/site/src/components/docs/PhoneFrame.astro` — shared optimized screenshot
  renderer.
- `apps/site/src/components/docs/GuideStep.astro` — numbered step card with an
  optional screenshot.
- `apps/site/src/components/docs/DocsSidebar.astro` — three-tier desktop/mobile
  guide navigation.
- `apps/site/src/components/docs/DocsSearch.tsx` — supporting search that stays
  quiet until the user enters a query.
- `apps/site/src/pages/docs/index.astro` — original-style task-first guide
  landing page.
- `apps/site/src/pages/docs/guides/[...slug].astro` — guide hero, screenshot,
  prose, related links, and pagination.
- `apps/site/src/content/docs/*.mdx` — exactly nine concise guides.
- `apps/site/public/_redirects` — standalone-site compatibility plus aliases
  for the first PR revision.
- `apps/site/src/__tests__/docs-content.test.ts` — content, tier, screenshot,
  size, and redirect contracts.
- `apps/site/src/__tests__/smoke.test.ts` — public-route and workflow smoke
  contracts.
- `apps/site/tests/docs.spec.ts` — browser behavior, assets, and responsive
  coverage.
- `apps/site/src/styles/globals.css` — tier cards, step cards, and phone frames.

## Task 1: Replace categories with the approved tier contract

**Files:**

- Modify: `apps/site/src/lib/docs.ts`
- Modify: `apps/site/src/content.config.ts`
- Modify: `apps/site/src/__tests__/docs-content.test.ts`
- Modify: `apps/site/public/_redirects`

- [x] **Step 1: Write the failing tier, guide, and redirect tests**

Replace the category assertions in `docs-content.test.ts` with these exact
contracts before changing implementation:

```ts
it("defines the approved task-first tiers", () => {
  expect(DOCS_TIERS).toEqual([
    { id: "core", label: "Core workflows" },
    { id: "everyday", label: "Everyday tasks" },
    { id: "setup", label: "Setup & account" },
  ]);
});

it("keeps old and first-revision routes compatible", () => {
  expect(LEGACY_DOC_REDIRECTS["/guides/generate-ai-report"]).toBe(
    "/docs/guides/generate-ai-report",
  );
  expect(FIRST_REVISION_DOC_REDIRECTS["/docs/guides/ai-generation"]).toBe(
    "/docs/guides/generate-ai-report",
  );
  expect(FIRST_REVISION_DOC_REDIRECTS["/docs/guides/account-deletion-and-help"]).toBe(
    "/docs/guides/your-account",
  );
});
```

Import `DOCS_TIERS` and `FIRST_REVISION_DOC_REDIRECTS` from `../lib/docs`.
Keep the existing prohibited-copy assertions.

- [x] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
corepack pnpm --filter @harpa/site test -- src/__tests__/docs-content.test.ts
```

Expected: FAIL because `DOCS_TIERS` and `FIRST_REVISION_DOC_REDIRECTS` do not
exist.

- [x] **Step 3: Define tiers, screenshot ids, sorting, and canonical redirects**

Replace the category model in `docs.ts` with:

```ts
export const DOCS_TIERS = [
  { id: "core", label: "Core workflows" },
  { id: "everyday", label: "Everyday tasks" },
  { id: "setup", label: "Setup & account" },
] as const;

export type DocsTier = (typeof DOCS_TIERS)[number]["id"];

export const DOCS_SCREENSHOT_IDS = [
  "projects-list",
  "reports-list",
  "members-team",
  "voice-recording",
  "final-report-issues",
  "final-report-sections",
  "pdf-preview",
  "usage",
] as const;

export type DocsScreenshotId = (typeof DOCS_SCREENSHOT_IDS)[number];

export const LEGACY_DOC_REDIRECTS = {
  "/guides/generate-ai-report": "/docs/guides/generate-ai-report",
  "/guides/export-share-pdf": "/docs/guides/export-share-pdf",
  "/guides/manage-projects": "/docs/guides/manage-projects",
  "/guides/capture-notes-voice": "/docs/guides/capture-notes-voice",
  "/guides/collaborate-members": "/docs/guides/collaborate-members",
  "/guides/edit-report-manually": "/docs/guides/edit-report-manually",
  "/guides/browse-saved-reports": "/docs/guides/browse-saved-reports",
  "/guides/getting-started": "/docs/guides/getting-started",
  "/guides/your-account": "/docs/guides/your-account",
  "/search": "/docs",
} as const;

export const FIRST_REVISION_DOC_REDIRECTS = {
  "/docs/guides/projects-and-history": "/docs/guides/browse-saved-reports",
  "/docs/guides/managing-reports": "/docs/guides/generate-ai-report",
  "/docs/guides/capturing-notes": "/docs/guides/capture-notes-voice",
  "/docs/guides/ai-generation": "/docs/guides/generate-ai-report",
  "/docs/guides/editing-reports": "/docs/guides/edit-report-manually",
  "/docs/guides/finalize-export-share": "/docs/guides/export-share-pdf",
  "/docs/guides/project-members": "/docs/guides/collaborate-members",
  "/docs/guides/account-and-usage": "/docs/guides/your-account",
  "/docs/guides/account-deletion-and-help": "/docs/guides/your-account",
} as const;
```

Change `SortableGuide.data.category` to `SortableGuide.data.tier`, sort using
`DOCS_TIERS`, and replace `docsCategoryLabel` with:

```ts
export function docsTierLabel(tier: DocsTier): string {
  return DOCS_TIERS.find(({ id }) => id === tier)?.label ?? "Guides";
}
```

- [x] **Step 4: Update the Astro guide schema**

Import `DOCS_SCREENSHOT_IDS` into `content.config.ts` and use this schema:

```ts
schema: z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  tier: z.enum(DOCS_TIERS),
  order: z.number().int().positive(),
  keywords: z.array(z.string().min(1)).min(1),
  lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  related: z.array(z.string()).default([]),
  heroScreenshot: z.enum(DOCS_SCREENSHOT_IDS),
  heroScreenshotAlt: z.string().min(12),
}),
```

Use local tuple aliases before `z.enum` so TypeScript retains the literal tuple:

```ts
const DOCS_TIERS = ["core", "everyday", "setup"] as const;
```

- [x] **Step 5: Replace the checked-in redirects**

Write `apps/site/public/_redirects` with all ten legacy entries followed by the
nine first-revision aliases. Every line uses `301`. The first two lines are:

```text
/guides/generate-ai-report /docs/guides/generate-ai-report 301
/guides/export-share-pdf /docs/guides/export-share-pdf 301
```

The last two lines are:

```text
/docs/guides/account-and-usage /docs/guides/your-account 301
/docs/guides/account-deletion-and-help /docs/guides/your-account 301
```

- [x] **Step 6: Re-run the focused model test**

Run the Task 1 test again. Expected: the new tier and redirect assertions pass,
but the complete file remains red because the existing ten-guide corpus still
uses the old schema and routes. This is an intentional TDD checkpoint; Tasks 3
and 4 migrate the complete corpus before the first implementation commit.

- [x] **Step 7: Keep the model changes uncommitted until the corpus is green**

Do not create a deliberately broken intermediate commit. Keep these focused
changes in the worktree and continue directly to Task 2.

## Task 2: Add optimized v4 screenshot primitives

**Files:**

- Create: `apps/site/src/assets/docs/01-projects-list.png`
- Create: `apps/site/src/assets/docs/02-reports-list.png`
- Create: `apps/site/src/assets/docs/03-members-team.png`
- Create: `apps/site/src/assets/docs/04-voice-recording.png`
- Create: `apps/site/src/assets/docs/05-final-report-issues.png`
- Create: `apps/site/src/assets/docs/06-final-report-sections.png`
- Create: `apps/site/src/assets/docs/07-pdf-preview.png`
- Create: `apps/site/src/assets/docs/08-usage.png`
- Create: `apps/site/src/lib/docs-screenshots.ts`
- Create: `apps/site/src/components/docs/PhoneFrame.astro`
- Create: `apps/site/src/components/docs/GuideStep.astro`
- Modify: `apps/site/src/__tests__/docs-content.test.ts`

- [x] **Step 1: Write the failing screenshot registry test**

Add:

```ts
import { statSync } from "node:fs";
import { DOCS_SCREENSHOT_IDS } from "../lib/docs";

it("registers every approved v4 docs screenshot", () => {
  const registry = readFileSync(resolve(srcRoot, "lib/docs-screenshots.ts"), "utf8");
  for (const id of DOCS_SCREENSHOT_IDS) {
    expect(registry, id).toContain(`"${id}"`);
  }

  const files = readdirSync(resolve(srcRoot, "assets/docs"));
  expect(files).toHaveLength(8);
  for (const file of files) {
    expect(statSync(resolve(srcRoot, "assets/docs", file)).size, file)
      .toBeGreaterThan(100_000);
  }
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run the content test. Expected: FAIL because `docs-screenshots.ts` is missing.

- [x] **Step 3: Copy the reviewed screenshots into the site asset graph**

Copy, without modifying the source App Store assets:

```bash
cp apps/mobile/fastlane/screenshots/en-US/01_projects_list.png \
  apps/site/src/assets/docs/01-projects-list.png
cp apps/mobile/fastlane/screenshots/en-US/02_reports_list.png \
  apps/site/src/assets/docs/02-reports-list.png
cp apps/mobile/fastlane/screenshots/en-US/03_members_team.png \
  apps/site/src/assets/docs/03-members-team.png
cp apps/mobile/fastlane/screenshots/en-US/04_voice_recording.png \
  apps/site/src/assets/docs/04-voice-recording.png
cp apps/mobile/fastlane/screenshots/en-US/05_final_report_issues.png \
  apps/site/src/assets/docs/05-final-report-issues.png
cp apps/mobile/fastlane/screenshots/en-US/06_final_report_sections_unplaced.png \
  apps/site/src/assets/docs/06-final-report-sections.png
cp apps/mobile/fastlane/screenshots/en-US/07_pdf_preview.png \
  apps/site/src/assets/docs/07-pdf-preview.png
cp apps/mobile/fastlane/screenshots/en-US/08_usage.png \
  apps/site/src/assets/docs/08-usage.png
```

- [x] **Step 4: Implement the typed screenshot registry**

`docs-screenshots.ts` statically imports all eight images and exports:

```ts
import type { ImageMetadata } from "astro";
import type { DocsScreenshotId } from "./docs";
import projectsList from "../assets/docs/01-projects-list.png";
import reportsList from "../assets/docs/02-reports-list.png";
import membersTeam from "../assets/docs/03-members-team.png";
import voiceRecording from "../assets/docs/04-voice-recording.png";
import finalReportIssues from "../assets/docs/05-final-report-issues.png";
import finalReportSections from "../assets/docs/06-final-report-sections.png";
import pdfPreview from "../assets/docs/07-pdf-preview.png";
import usage from "../assets/docs/08-usage.png";

export const DOCS_SCREENSHOTS = {
  "projects-list": projectsList,
  "reports-list": reportsList,
  "members-team": membersTeam,
  "voice-recording": voiceRecording,
  "final-report-issues": finalReportIssues,
  "final-report-sections": finalReportSections,
  "pdf-preview": pdfPreview,
  usage,
} satisfies Record<DocsScreenshotId, ImageMetadata>;

export function docsScreenshot(id: DocsScreenshotId): ImageMetadata {
  return DOCS_SCREENSHOTS[id];
}
```

- [x] **Step 5: Implement the shared phone frame**

Create `PhoneFrame.astro`:

```astro
---
import { Image } from "astro:assets";
import type { DocsScreenshotId } from "../../lib/docs";
import { docsScreenshot } from "../../lib/docs-screenshots";

interface Props {
  screenshot: DocsScreenshotId;
  alt: string;
  compact?: boolean;
  priority?: boolean;
}

const { screenshot, alt, compact = false, priority = false } = Astro.props;
const image = docsScreenshot(screenshot);
---

<figure class:list={["docs-phone-frame", { "docs-phone-frame--compact": compact }]}>
  <div>
    <Image
      src={image}
      alt={alt}
      widths={[220, 320, 420]}
      sizes={compact ? "(min-width: 64rem) 200px, 180px" : "(min-width: 64rem) 320px, 240px"}
      format="webp"
      quality={82}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
    />
  </div>
</figure>
```

- [x] **Step 6: Implement the numbered guide-step component**

Create `GuideStep.astro` with required `number` and `title`, plus an optional
screenshot pair. Use this exact prop contract so an image cannot compile
without alt text:

```ts
type WithScreenshot = {
  screenshot: DocsScreenshotId;
  screenshotAlt: string;
};

type WithoutScreenshot = {
  screenshot?: never;
  screenshotAlt?: never;
};

type Props = {
  number: number;
  title: string;
} & (WithScreenshot | WithoutScreenshot);
```

Render the step copy and image as siblings:

```astro
<section class="docs-step">
  <div class="docs-step-copy">
    <header>
      <span aria-hidden="true">{number}</span>
      <h2>{title}</h2>
    </header>
    <div class="docs-step-body"><slot /></div>
  </div>
  {screenshot && screenshotAlt && (
    <PhoneFrame screenshot={screenshot} alt={screenshotAlt} compact />
  )}
</section>
```

Reject a screenshot without alt text by typing the props as a discriminated
union rather than silently omitting the image.

- [x] **Step 7: Run the screenshot registry test**

Run the content test. Expected: the screenshot registry assertion passes; the
guide corpus remains red until Tasks 3 and 4.

- [x] **Step 8: Keep the screenshot changes with the pending migration**

Do not commit yet because the required screenshot frontmatter has not been
added to the guide corpus. Continue directly to Task 3.

## Task 3: Replace the core workflows with concise v4 guides

**Files:**

- Delete: `apps/site/src/content/docs/01-getting-started.mdx`
- Delete: `apps/site/src/content/docs/02-projects-and-history.mdx`
- Delete: `apps/site/src/content/docs/03-managing-reports.mdx`
- Delete: `apps/site/src/content/docs/04-capturing-notes.mdx`
- Delete: `apps/site/src/content/docs/05-ai-generation.mdx`
- Delete: `apps/site/src/content/docs/06-editing-reports.mdx`
- Delete: `apps/site/src/content/docs/07-finalize-export-share.mdx`
- Delete: `apps/site/src/content/docs/08-project-members.mdx`
- Delete: `apps/site/src/content/docs/09-account-and-usage.mdx`
- Delete: `apps/site/src/content/docs/10-account-deletion-and-help.mdx`
- Create: `apps/site/src/content/docs/01-generate-ai-report.mdx`
- Create: `apps/site/src/content/docs/02-export-share-pdf.mdx`

- [x] **Step 1: Add the failing step and word-limit contract**

Add helpers to strip frontmatter, imports, and component tags, then count words:

```ts
function guideStepCount(source: string): number {
  return source.match(/<GuideStep\b/g)?.length ?? 0;
}

function guideWordCount(source: string): number {
  return source
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/^import .*$/gm, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[^\p{L}\p{N}'’-]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
```

Define the complete canonical corpus in the test:

```ts
const EXPECTED_GUIDES = [
  "01-generate-ai-report.mdx",
  "02-export-share-pdf.mdx",
  "03-manage-projects.mdx",
  "04-capture-notes-voice.mdx",
  "05-collaborate-members.mdx",
  "06-edit-report-manually.mdx",
  "07-browse-saved-reports.mdx",
  "08-getting-started.mdx",
  "09-your-account.mdx",
] as const;

expect(files).toEqual(EXPECTED_GUIDES);
expect(
  files.filter((file) =>
    readFileSync(resolve(contentRoot, file), "utf8").includes('tier: "core"'),
  ),
).toHaveLength(2);
```

For each source, assert `heroScreenshot`, `heroScreenshotAlt`, three to five
steps, and the tier-specific word limit:

```ts
const tier = source.match(/^tier: "([^"]+)"$/m)?.[1];
expect(guideStepCount(source), `${file} steps`).toBeGreaterThanOrEqual(3);
expect(guideStepCount(source), `${file} steps`).toBeLessThanOrEqual(
  tier === "core" ? 5 : 4,
);
expect(guideWordCount(source), `${file} words`).toBeLessThanOrEqual(
  tier === "core" ? 450 : 300,
);
expect(source).toMatch(/^heroScreenshot: "[^"]+"$/m);
expect(source).toMatch(/^heroScreenshotAlt: ".{12,}"$/m);
expect(source).not.toContain("## Good to know");
```

- [x] **Step 2: Run the focused test and confirm the old corpus fails**

Expected: FAIL because the old guides do not use `GuideStep`, lack required
hero screenshot metadata, and total ten rather than nine.

- [x] **Step 3: Remove the ten first-revision guide files**

Delete only the ten files listed above. Do not remove layouts, tests, or
shared components.

- [x] **Step 4: Write `01-generate-ai-report.mdx`**

Use this frontmatter:

```yaml
title: "Generate an AI report"
description: "Capture the day, generate a structured report, review it, and finalize it."
tier: "core"
order: 1
keywords: ["generate", "report", "notes", "voice", "photo", "finalize"]
lastVerified: "2026-07-03"
related: ["capture-notes-voice", "edit-report-manually", "export-share-pdf"]
heroScreenshot: "final-report-issues"
heroScreenshotAlt: "Generated Harpa Pro report showing prioritized site issues and actions"
```

Import `GuideStep`. Write exactly five steps:

1. **Start a report** — open a project, open Reports, tap New report. Use the
   reports-list screenshot.
2. **Capture what happened** — add short text, photo, or voice notes; send each
   note into the timeline. Use the voice-recording screenshot.
3. **Generate the report** — tap Generate report after uploads finish and keep
   the draft open while generation completes.
4. **Review and correct it** — review Report; use per-card pencil actions for
   edits; note changes automatically queue an updated draft. Explicitly say
   there is no separate Edit tab. Use the final-report-issues screenshot.
5. **Finalize** — verify names, dates, quantities, issues, and commitments,
   then tap Finalize report. Explain that final reports stop auto-updating.

End with one blockquote: generated output is a draft and must be reviewed.
Do not add separate tips, platform, or troubleshooting sections.

- [x] **Step 5: Write `02-export-share-pdf.mdx`**

Use this frontmatter:

```yaml
title: "Export and share a PDF"
description: "Open a finalized report, preview its PDF, and share or save it."
tier: "core"
order: 2
keywords: ["pdf", "export", "share", "save", "finalized"]
lastVerified: "2026-07-03"
related: ["generate-ai-report", "browse-saved-reports", "edit-report-manually"]
heroScreenshot: "pdf-preview"
heroScreenshotAlt: "Harpa Pro PDF preview displaying a finalized daily site report"
```

Write exactly four `GuideStep` blocks:

1. **Open a finalized report** — project, Reports, finalized row. Use the
   reports-list screenshot.
2. **Open the PDF preview** — open the report actions menu and choose the PDF
   preview action.
3. **Review the PDF** — scan the summary, figures, issues, people, materials,
   and actions. Use the pdf-preview screenshot.
4. **Share or save it** — use Share in the preview and choose the destination
   from the system share sheet; PDF generation happens on the device.

Add one short final sentence: if a correction is needed, return to the report,
unfinalize if authorized, edit the affected card, and finalize again.

- [x] **Step 6: Run the focused content test**

Expected: screenshot, step, and word-limit checks pass for both core files;
the suite remains red because the seven smaller guides are not present yet.

- [x] **Step 7: Keep the core guides with the pending corpus migration**

Do not commit the incomplete two-guide corpus. Continue directly to Task 4.

## Task 4: Add the seven short task and setup guides

**Files:**

- Create: `apps/site/src/content/docs/03-manage-projects.mdx`
- Create: `apps/site/src/content/docs/04-capture-notes-voice.mdx`
- Create: `apps/site/src/content/docs/05-collaborate-members.mdx`
- Create: `apps/site/src/content/docs/06-edit-report-manually.mdx`
- Create: `apps/site/src/content/docs/07-browse-saved-reports.mdx`
- Create: `apps/site/src/content/docs/08-getting-started.mdx`
- Create: `apps/site/src/content/docs/09-your-account.mdx`
- Modify: `apps/site/src/__tests__/docs-content.test.ts`

- [x] **Step 1: Write the five everyday-task guides**

Each guide imports `GuideStep`, stays under 300 words, and uses no more than
four steps. Use these exact contracts:

| File | Tier/order | Hero screenshot | Steps |
| --- | --- | --- | --- |
| `03-manage-projects.mdx` | everyday/1 | projects-list | Create a project; open it; edit details; delete only when intended |
| `04-capture-notes-voice.mdx` | everyday/2 | voice-recording | Open a draft; add text; add photos; record and send voice |
| `05-collaborate-members.mdx` | everyday/3 | members-team | Open Members; invite by email; choose Owner/Editor/Viewer access |
| `06-edit-report-manually.mdx` | everyday/4 | final-report-sections | Open a draft; tap a card pencil; save/review or unfinalize first |
| `07-browse-saved-reports.mdx` | everyday/5 | reports-list | Open Reports; distinguish Draft and Finalized; reopen the report |

Use the canonical titles from the table of contents:

```yaml
title: "Create and manage projects"
title: "Capture notes, photos, and voice notes"
title: "Add members to a project"
title: "Edit a report manually"
title: "Browse and reopen saved reports"
```

Member copy must use email invitations and the current Owner, Editor, and
Viewer roles. Edit copy must describe per-card pencil controls, never a
dedicated Edit tab. Capture copy must not claim that the document picker is
available for new notes.

- [x] **Step 2: Write `08-getting-started.mdx`**

Use `tier: "setup"`, `order: 1`, and hero screenshot `projects-list`. Write
three steps only:

1. Enter the email address used for Harpa Pro.
2. Enter the one-time code from email; a first-time email creates the account.
3. Add the first project, then open Reports and start a draft.

End with links to Generate an AI report and Create and manage projects. Do not
repeat voice, editing, export, platform, or troubleshooting details here.

- [x] **Step 3: Write `09-your-account.mdx`**

Use `tier: "setup"`, `order: 2`, and hero screenshot `usage`. Write four short
steps:

1. Open the profile from Projects.
2. Review account details and usage history.
3. Clear local cached data or sign out when needed.
4. Request account deletion from the account screen; link to
   `/account-deletion` for the full deletion and support policy.

Keep privacy/support copy to one closing sentence with the existing support
email. Do not create another troubleshooting guide.

- [x] **Step 4: Complete the related-guide graph**

Use only canonical slugs. Every guide has two or three related guides. Ensure
all references resolve and no guide relates to itself.

- [x] **Step 5: Run the complete content contract**

```bash
corepack pnpm --filter @harpa/site test -- src/__tests__/docs-content.test.ts
```

Expected: PASS for nine guides, two core guides, tier ordering, screenshot ids,
alt text, related links, redirects, step counts, word limits, and prohibited
v3 terms.

- [x] **Step 6: Keep the green corpus ready for its consumers**

The content contract is green, but the index, sidebar, and guide route still
consume the old category shape. Continue directly to Task 5 before committing.

## Task 5: Restore the original task-first index and navigation

**Files:**

- Modify: `apps/site/src/pages/docs/index.astro`
- Modify: `apps/site/src/components/docs/DocsSidebar.astro`
- Modify: `apps/site/src/components/docs/DocsSearch.tsx`
- Modify: `apps/site/src/components/docs/DocsSearch.test.tsx`
- Modify: `apps/site/src/layouts/DocsLayout.astro`
- Modify: `apps/site/src/pages/docs/guides/[...slug].astro`
- Modify: `apps/site/src/styles/globals.css`

- [x] **Step 1: Write failing search and shell assertions**

Update `DocsSearch.test.tsx` to require no duplicate guide grid before a query:

```tsx
render(<DocsSearch entries={entries} />);
expect(screen.queryByText("1 guide")).not.toBeInTheDocument();
expect(screen.queryByRole("link", { name: "Generate an AI report" }))
  .not.toBeInTheDocument();

fireEvent.change(screen.getByLabelText("Search guides"), {
  target: { value: "generate" },
});
expect(screen.getByText("1 guide")).toBeInTheDocument();
expect(screen.getByRole("link", { name: "Generate an AI report" }))
  .toBeInTheDocument();
```

Add source assertions to `docs-content.test.ts` for the landing heading, tier
sections, `PhoneFrame`, and guide-page hero screenshot.

- [x] **Step 2: Run the focused component tests and confirm failure**

Run the search and content tests. Expected: search still renders all guides for
an empty query and the page sources lack the new tier presentation.

- [x] **Step 3: Make search a supporting interaction**

In `DocsSearch.tsx`, derive:

```ts
const hasQuery = query.trim().length > 0;
const results = useMemo(
  () => (hasQuery ? searchGuides(entries, query) : []),
  [entries, hasQuery, query],
);
```

Always render the labeled input. Render count, results, and empty state only
when `hasQuery` is true. Keep the clear button and local-only behavior.

- [x] **Step 4: Rebuild `/docs` around the three tiers**

In `index.astro`:

1. Load and sort the nine guides.
2. Split them into `coreGuides`, `everydayGuides`, and `setupGuides`.
3. Render a hero headed **What do you want to do?** with a one-sentence intro,
   `DocsSearch`, and `PhoneFrame` using `final-report-issues`.
4. Render exactly two large numbered core cards.
5. Render five compact everyday cards.
6. Render two setup/account pill links.

The core card link text is **Read the steps →**. Do not add category summaries,
feature marketing copy, platform badges, or a guide count.

- [x] **Step 5: Convert sidebar navigation to tiers**

Replace category imports and labels with `DOCS_TIERS`. Use
`guide.data.tier === tier.id`. Set the navigation label to `Guide sections` and
keep `aria-current="page"` behavior.

- [x] **Step 6: Add screenshots to guide headers and steps**

In `[...slug].astro`, replace `docsCategoryLabel` with `docsTierLabel`. Render
the heading and hero `PhoneFrame` in a two-column header:

```astro
<header class="docs-guide-heading">
  <div>
    <p>{docsTierLabel(guide.data.tier)}</p>
    <h1>{guide.data.title}</h1>
    <span>{guide.data.description}</span>
  </div>
  <PhoneFrame
    screenshot={guide.data.heroScreenshot}
    alt={guide.data.heroScreenshotAlt}
    priority
  />
</header>
```

Keep the verified date in page metadata/tests, but remove it from the visible
hero to reduce noise.

- [x] **Step 7: Add focused tier, card, step, and phone-frame styles**

In `globals.css`:

- make the docs index hero a responsive two-column grid;
- cap the regular phone frame at `20rem` and compact frames at `12.5rem`;
- use a rounded dark outer shell and light inner bezel without adding a fake
  notch or generated device chrome;
- use two columns for core cards and everyday cards on wider screens;
- give core cards stronger spacing and numbered accent circles;
- render setup links as compact pills;
- make `.docs-step` a copy/image grid on desktop and a single column on mobile;
- keep every interactive target at least 44px tall;
- preserve existing focus rings and reduced-motion behavior.

- [x] **Step 8: Run unit, lint, and type checks**

```bash
corepack pnpm --filter @harpa/site test
corepack pnpm --filter @harpa/site lint
corepack pnpm --filter @harpa/site typecheck
```

Expected: all site unit/content tests pass; lint and Astro report no errors.

- [x] **Step 9: Commit the task-first presentation**

```bash
git add apps/site/src/lib/docs.ts apps/site/src/lib/docs-screenshots.ts \
  apps/site/src/content.config.ts apps/site/src/assets/docs \
  apps/site/src/content/docs apps/site/src/components/docs \
  apps/site/src/pages/docs apps/site/src/layouts/DocsLayout.astro \
  apps/site/src/styles/globals.css apps/site/src/__tests__ \
  apps/site/public/_redirects
git commit -m "feat(site): restore task-first docs with screenshots"
```

## Task 6: Update browser coverage and compatibility checks

**Files:**

- Modify: `apps/site/tests/docs.spec.ts`
- Modify: `apps/site/src/__tests__/smoke.test.ts`
- Modify: `apps/site/src/pages/sitemap.xml.ts`
- Modify: `.github/workflows/site-preview.yml`

- [x] **Step 1: Rewrite browser expectations for the approved structure**

Update `docs.spec.ts` to assert:

```ts
await expect(page.getByRole("heading", {
  level: 1,
  name: "What do you want to do?",
})).toBeVisible();
await expect(page.getByRole("heading", { name: "Core workflows" })).toBeVisible();
await expect(page.locator(".docs-core-grid > *")).toHaveCount(2);
await expect(page.locator(".docs-everyday-grid > *")).toHaveCount(5);
await expect(page.locator(".docs-setup-links li")).toHaveCount(2);
```

Search for `voice` and expect **Capture notes, photos, and voice notes**. Search
for a nonsense term and retain the no-results/clear behavior.

- [x] **Step 2: Add screenshot and guide-limit browser checks**

From `/docs`, request every image and require status below 400. Open
`/docs/guides/generate-ai-report` and assert:

- the hero image has non-empty alt text;
- there are exactly five `.docs-step` sections;
- every screenshot has a generated `/_astro/` URL;
- the page has no horizontal overflow at 390×844;
- mobile tier navigation exposes Export and share a PDF and Your account.

- [x] **Step 3: Update pagination and canonical-route expectations**

Pagination from Generate an AI report must lead to Export and share a PDF.
Direct requests to all nine canonical guides must return below 400. Keep the
branded unknown-guide 404 assertion.

- [x] **Step 4: Update sitemap and smoke contracts**

The sitemap continues to derive guides from the content collection, so no
hard-coded nine-route list is added. Update smoke tests to require all legacy
and first-revision redirect lines in `_redirects` and retain the terminating
newline assertion for the deployed redirect probe.

- [x] **Step 5: Verify the deployed redirect against a canonical old path**

Keep the preview workflow probe at `/guides/getting-started`; its expected
location remains `/docs/guides/getting-started`. No workflow behavior changes
beyond updated explanatory text if needed.

- [x] **Step 6: Build and run Playwright in CI mode**

```bash
PUBLIC_API_BASE_URL=https://api.harpapro.com \
PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA \
  corepack pnpm --filter @harpa/site build
CI=1 corepack pnpm --filter @harpa/site test:e2e
```

Expected: the static build emits `/docs` plus nine guide routes; all Playwright
tests pass with one Chromium worker.

- [x] **Step 7: Run Lighthouse against the screenshot-heavy revision**

```bash
corepack pnpm exec lhci autorun --config=./lighthouserc.json
```

Expected: homepage and `/docs` keep performance/accessibility at or above 0.90
and best-practices/SEO at or above 0.95. If image weight causes a regression,
fix `PhoneFrame` image widths/quality rather than lowering thresholds.

- [x] **Step 8: Commit browser and compatibility coverage**

```bash
git add apps/site/tests/docs.spec.ts apps/site/src/__tests__/smoke.test.ts \
  apps/site/src/pages/sitemap.xml.ts .github/workflows/site-preview.yml
git commit -m "test(site): gate task-first docs and screenshots"
```

## Task 7: Reconcile documentation, verify, and update the pull request

**Files:**

- Modify: `apps/site/README.md`
- Modify: `docs/v4/plan-public-site-docs-task-first.md`
- Modify: `docs/v4/plan-public-site-docs.md` only if it states the superseded
  ten-guide structure as current behavior
- Comment on PR #191 after the implementation is pushed

- [x] **Step 1: Update supported docs counts and structure**

Document the nine-guide, three-tier structure and the reused v4 screenshot
source in `apps/site/README.md`. Do not rewrite historical planning prose that
is already clearly labeled historical.

- [x] **Step 2: Search for superseded current-state claims**

```bash
rg -n "ten guides|10 guides|DOCS_CATEGORIES|category navigation|capturing-notes|ai-generation|editing-reports|finalize-export-share|project-members|account-and-usage|account-deletion-and-help" \
  apps/site docs/v4 \
  --glob '!docs/v4/plan-public-site-docs.md' \
  --glob '!docs/v4/plan-public-site-docs-task-first.md'
```

Expected: no supported code or current architecture document points at the
superseded corpus. Redirect aliases and explicitly historical text are allowed.

- [x] **Step 3: Run the complete site verification**

```bash
corepack pnpm --filter @harpa/site test
corepack pnpm --filter @harpa/site lint
corepack pnpm --filter @harpa/site typecheck
PUBLIC_API_BASE_URL=https://api.harpapro.com \
PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA \
  corepack pnpm --filter @harpa/site build
CI=1 corepack pnpm --filter @harpa/site test:e2e
corepack pnpm exec lhci autorun --config=./lighthouserc.json
```

Expected: unit/content tests, lint, typecheck, 16-page static build (homepage,
legal/roadmap/discovery pages, `/docs`, and nine guides), Playwright, and all
Lighthouse assertions pass.

- [x] **Step 4: Run repository consistency checks**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and only the intended plan-checkbox/README
changes remain.

- [x] **Step 5: Mark this plan complete and commit the handoff state**

Change every completed checkbox in this file to `[x]`, then:

```bash
git add apps/site/README.md docs/v4/plan-public-site-docs-task-first.md \
  docs/v4/plan-public-site-docs.md
git commit -m "docs(site): complete task-first docs revision"
```

- [x] **Step 6: Push through the repository pre-push gate**

Use pnpm 9.12.3 from `corepack`; do not bypass hooks:

```bash
git push
```

Expected: repository lint guards, monorepo typecheck/tests, fixture hashes,
migration consistency, and secret scan pass before the branch updates.

- [x] **Step 7: Update PR #191 and monitor CI**

Post the implementation summary without overwriting the existing PR body:

```bash
gh pr comment 191 --body "Updated the docs revision around two core workflows and seven concise supporting guides. The site now follows the original task-first hierarchy and uses the reviewed current v4 App Store screenshots, optimized through Astro's asset pipeline. Local unit, lint, typecheck, build, Playwright, and Lighthouse checks passed before push."
gh pr checks 191 --watch --interval 20
```

Watch `site-preview` through screenshot asset checks, Lighthouse, Cloudflare
deploy, and deployed redirect verification. Report any unrelated external
failure separately rather than weakening the site gates.
