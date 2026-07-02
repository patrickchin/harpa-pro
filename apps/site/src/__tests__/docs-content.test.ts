import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  DOCS_SCREENSHOT_IDS,
  DOCS_TIERS,
  FIRST_REVISION_DOC_REDIRECTS,
  LEGACY_DOC_REDIRECTS,
  docsTierLabel,
  guideHref,
  guideSlug,
  sortGuides,
} from "../lib/docs";

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = resolve(srcRoot, "content/docs");
const screenshotDir = resolve(srcRoot, "assets/docs");

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

const EXPECTED_SCREENSHOTS = [
  "projects-list",
  "reports-list",
  "members-team",
  "voice-recording",
  "final-report-issues",
  "final-report-sections",
  "pdf-preview",
  "usage",
] as const;

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

describe("docs content model", () => {
  it("normalizes ordered content ids to public slugs", () => {
    expect(guideSlug("01-getting-started.mdx")).toBe("getting-started");
    expect(guideSlug("project-members.md")).toBe("project-members");
  });

  it("defines the approved task-first tiers", () => {
    const ids = DOCS_TIERS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DOCS_TIERS).toEqual([
      { id: "core", label: "Core workflows" },
      { id: "everyday", label: "Everyday tasks" },
      { id: "setup", label: "Setup & account" },
    ]);
  });

  it("sorts guides by tier then display order", () => {
    const guides = [
      { id: "second", data: { tier: "everyday" as const, order: 2 } },
      { id: "setup", data: { tier: "setup" as const, order: 1 } },
      { id: "first", data: { tier: "everyday" as const, order: 1 } },
    ];

    expect(sortGuides(guides).map(({ id }) => id)).toEqual([
      "first",
      "second",
      "setup",
    ]);
    expect(docsTierLabel("everyday")).toBe("Everyday tasks");
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
    expect(LEGACY_DOC_REDIRECTS["/guides/generate-ai-report"]).toBe(
      "/docs/guides/generate-ai-report",
    );
  });

  it("keeps first-revision routes compatible", () => {
    expect(FIRST_REVISION_DOC_REDIRECTS["/docs/guides/ai-generation"]).toBe(
      "/docs/guides/generate-ai-report",
    );
    expect(
      FIRST_REVISION_DOC_REDIRECTS[
        "/docs/guides/account-deletion-and-help"
      ],
    ).toBe("/docs/guides/your-account");
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

    const docsIndex = readFileSync(
      resolve(srcRoot, "pages/docs/index.astro"),
      "utf8",
    );
    expect(docsIndex).toContain("What do you want to do?");
    expect(docsIndex).toContain("docs-core-grid");
    expect(docsIndex).toContain("docs-everyday-grid");
    expect(docsIndex).toContain("docs-setup-links");
    expect(docsIndex).toContain("<PhoneFrame");

    const guidePage = readFileSync(
      resolve(srcRoot, "pages/docs/guides/[...slug].astro"),
      "utf8",
    );
    expect(guidePage).toContain("docsTierLabel");
    expect(guidePage).toContain("guide.data.heroScreenshot");

    const sidebar = readFileSync(
      resolve(srcRoot, "components/docs/DocsSidebar.astro"),
      "utf8",
    );
    expect(sidebar).toContain("DOCS_TIERS");
    expect(sidebar).toContain('aria-label="Guide sections"');
  });

  it("ships nine concise task-first guides without stale v3 claims", () => {
    expect(existsSync(docsDir)).toBe(true);
    const files = readdirSync(docsDir)
      .filter((file) => file.endsWith(".mdx"))
      .sort();
    expect(files).toEqual(EXPECTED_GUIDES);

    const slugs = new Set(files.map((file) => guideSlug(file)));
    expect(slugs.size).toBe(files.length);

    const routes = new Set([...slugs].map((slug) => `/docs/guides/${slug}`));
    for (const target of Object.values(LEGACY_DOC_REDIRECTS)) {
      if (target !== "/docs") expect(routes.has(target), target).toBe(true);
    }
    for (const target of Object.values(FIRST_REVISION_DOC_REDIRECTS)) {
      expect(routes.has(target), target).toBe(true);
    }

    for (const file of files) {
      const source = readFileSync(resolve(docsDir, file), "utf8");
      const tier = source.match(/^tier: "([^"]+)"$/m)?.[1];
      expect(guideStepCount(source), `${file} steps`).toBeGreaterThanOrEqual(3);
      expect(guideStepCount(source), `${file} steps`).toBeLessThanOrEqual(
        tier === "core" ? 5 : 4,
      );
      expect(guideWordCount(source), `${file} words`).toBeLessThanOrEqual(
        tier === "core" ? 450 : 300,
      );
      expect(source, `${file} screenshot`).toMatch(
        /^heroScreenshot: "[^"]+"$/m,
      );
      expect(source, `${file} screenshot alt`).toMatch(
        /^heroScreenshotAlt: ".{12,}"$/m,
      );
      expect(source).not.toContain("## Good to know");
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

  it("registers every approved v4 docs screenshot", () => {
    const registryPath = resolve(srcRoot, "lib/docs-screenshots.ts");
    expect(existsSync(registryPath)).toBe(true);
    const registry = readFileSync(registryPath, "utf8");
    expect(DOCS_SCREENSHOT_IDS).toEqual(EXPECTED_SCREENSHOTS);
    for (const id of DOCS_SCREENSHOT_IDS) {
      expect(registry, id).toContain(`"${id}"`);
    }

    expect(existsSync(screenshotDir)).toBe(true);
    const files = readdirSync(screenshotDir).sort();
    expect(files).toHaveLength(8);
    for (const file of files) {
      expect(statSync(resolve(screenshotDir, file)).size, file).toBeGreaterThan(
        100_000,
      );
    }
  });
});
