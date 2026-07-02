import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  DOCS_CATEGORIES,
  LEGACY_DOC_REDIRECTS,
  docsCategoryLabel,
  guideHref,
  guideSlug,
  sortGuides,
} from "../lib/docs";

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = resolve(srcRoot, "content/docs");

const PROHIBITED_DOCS_COPY = [
  /phone number/i,
  /text message/i,
  /\bSMS\b/i,
  /\bAdmin\b/,
  /dedicated Edit tab/i,
  /server-generated PDF/i,
  /available on Android/i,
  /\bH3\b/,
];

function readJsonArray(source: string, key: string): string[] {
  const value = source.match(new RegExp(`^${key}:\\s*(\\[.*\\])$`, "m"))?.[1];
  return value ? (JSON.parse(value) as string[]) : [];
}

describe("docs content model", () => {
  it("normalizes ordered content ids to public slugs", () => {
    expect(guideSlug("01-getting-started.mdx")).toBe("getting-started");
    expect(guideSlug("project-members.md")).toBe("project-members");
  });

  it("keeps category ids unique", () => {
    const ids = DOCS_CATEGORIES.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sorts guides by category then display order", () => {
    const guides = [
      { id: "second", data: { category: "reporting" as const, order: 2 } },
      { id: "account", data: { category: "account" as const, order: 1 } },
      { id: "first", data: { category: "reporting" as const, order: 1 } },
    ];

    expect(sortGuides(guides).map(({ id }) => id)).toEqual([
      "first",
      "second",
      "account",
    ]);
    expect(docsCategoryLabel("reporting")).toBe("Daily reporting");
    expect(guideHref("01-getting-started.mdx")).toBe(
      "/docs/guides/getting-started",
    );
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

  it("ships docs routes in the public site shell", () => {
    expect(existsSync(resolve(srcRoot, "pages/docs/index.astro"))).toBe(true);
    expect(
      existsSync(resolve(srcRoot, "pages/docs/guides/[...slug].astro")),
    ).toBe(true);
    expect(existsSync(resolve(srcRoot, "layouts/DocsLayout.astro"))).toBe(
      true,
    );

    const header = readFileSync(
      resolve(srcRoot, "components/landing/Header.astro"),
      "utf8",
    );
    expect(header).not.toContain("https://docs.harpapro.com");
    expect(header).toContain('href="/docs"');
  });

  it("ships ten complete v4 guides without stale v3 claims", () => {
    expect(existsSync(docsDir)).toBe(true);
    const files = readdirSync(docsDir)
      .filter((file) => file.endsWith(".mdx"))
      .sort();
    expect(files).toHaveLength(10);

    const slugs = new Set(files.map((file) => guideSlug(file)));
    expect(slugs.size).toBe(files.length);

    const routes = new Set([...slugs].map((slug) => `/docs/guides/${slug}`));
    for (const target of Object.values(LEGACY_DOC_REDIRECTS)) {
      if (target !== "/docs") expect(routes.has(target), target).toBe(true);
    }

    for (const file of files) {
      const source = readFileSync(resolve(docsDir, file), "utf8");
      expect(source, `${file} guide sections`).toMatch(/^## /m);
      expect(source, `${file} good-to-know section`).toContain(
        "## Good to know",
      );
      expect(source, `${file} troubleshooting section`).toContain(
        "## Troubleshooting",
      );
      expect(source, `${file} verification date`).toMatch(
        /^lastVerified: "\d{4}-\d{2}-\d{2}"$/m,
      );

      for (const related of readJsonArray(source, "related")) {
        expect(slugs.has(related), `${basename(file)} -> ${related}`).toBe(
          true,
        );
      }

      for (const pattern of PROHIBITED_DOCS_COPY) {
        expect(source, `${file}: ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
