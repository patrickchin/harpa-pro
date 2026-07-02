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

export function guideSlug(id: string): string {
  return id.replace(/\.(md|mdx)$/, "").replace(/^\d+-/, "");
}

export function guideHref(id: string): string {
  return `/docs/guides/${guideSlug(id)}`;
}

export function docsTierLabel(tier: DocsTier): string {
  return DOCS_TIERS.find(({ id }) => id === tier)?.label ?? "Guides";
}

interface SortableGuide {
  data: {
    tier: DocsTier;
    order: number;
  };
}

export function sortGuides<T extends SortableGuide>(guides: readonly T[]): T[] {
  const tierOrder = new Map(DOCS_TIERS.map(({ id }, index) => [id, index]));

  return [...guides].sort((a, b) => {
    const tierDifference =
      (tierOrder.get(a.data.tier) ?? Number.MAX_SAFE_INTEGER) -
      (tierOrder.get(b.data.tier) ?? Number.MAX_SAFE_INTEGER);

    return tierDifference || a.data.order - b.data.order;
  });
}
