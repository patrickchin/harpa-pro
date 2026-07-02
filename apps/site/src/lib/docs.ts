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
