import { describe, expect, it } from "vitest";

import {
  DOCS_CATEGORIES,
  LEGACY_DOC_REDIRECTS,
  guideSlug,
} from "../lib/docs";

describe("docs content model", () => {
  it("normalizes ordered content ids to public slugs", () => {
    expect(guideSlug("01-getting-started.mdx")).toBe("getting-started");
    expect(guideSlug("project-members.md")).toBe("project-members");
  });

  it("keeps category ids unique", () => {
    const ids = DOCS_CATEGORIES.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("maps every live v3 guide path to one unique v4 destination", () => {
    expect(Object.keys(LEGACY_DOC_REDIRECTS).sort()).toEqual(
      [
        "/guides/browse-saved-reports",
        "/guides/capture-notes-voice",
        "/guides/collaborate-members",
        "/guides/edit-report-manually",
        "/guides/export-share-pdf",
        "/guides/generate-ai-report",
        "/guides/getting-started",
        "/guides/manage-projects",
        "/guides/your-account",
        "/search",
      ].sort(),
    );

    const targets = Object.values(LEGACY_DOC_REDIRECTS);
    expect(new Set(targets).size).toBe(targets.length);
  });
});
