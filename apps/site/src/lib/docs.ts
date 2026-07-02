export const DOCS_CATEGORIES = [
  { id: "start", label: "Start here" },
  { id: "reporting", label: "Daily reporting" },
  { id: "collaboration", label: "Collaboration" },
  { id: "account", label: "Account and support" },
] as const;

export type DocsCategory = (typeof DOCS_CATEGORIES)[number]["id"];

export const LEGACY_DOC_REDIRECTS = {
  "/guides/browse-saved-reports": "/docs/guides/projects-and-history",
  "/guides/capture-notes-voice": "/docs/guides/capturing-notes",
  "/guides/collaborate-members": "/docs/guides/project-members",
  "/guides/edit-report-manually": "/docs/guides/editing-reports",
  "/guides/export-share-pdf": "/docs/guides/finalize-export-share",
  "/guides/generate-ai-report": "/docs/guides/ai-generation",
  "/guides/getting-started": "/docs/guides/getting-started",
  "/guides/manage-projects": "/docs/guides/managing-reports",
  "/guides/your-account": "/docs/guides/account-and-usage",
  "/search": "/docs",
} as const;

export function guideSlug(id: string): string {
  return id.replace(/\.(md|mdx)$/, "").replace(/^\d+-/, "");
}

export function guideHref(id: string): string {
  return `/docs/guides/${guideSlug(id)}`;
}

export function docsCategoryLabel(category: DocsCategory): string {
  return (
    DOCS_CATEGORIES.find(({ id }) => id === category)?.label ?? "Guides"
  );
}

interface SortableGuide {
  data: {
    category: DocsCategory;
    order: number;
  };
}

export function sortGuides<T extends SortableGuide>(guides: readonly T[]): T[] {
  const categoryOrder = new Map(
    DOCS_CATEGORIES.map(({ id }, index) => [id, index]),
  );

  return [...guides].sort((a, b) => {
    const categoryDifference =
      (categoryOrder.get(a.data.category) ?? Number.MAX_SAFE_INTEGER) -
      (categoryOrder.get(b.data.category) ?? Number.MAX_SAFE_INTEGER);

    return categoryDifference || a.data.order - b.data.order;
  });
}
