import { describe, expect, it } from "vitest";

import {
  searchGuides,
  type DocsSearchEntry,
} from "./docs-search";

const entries: DocsSearchEntry[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    description: "Create a project and learn the voice workflow.",
    tier: "setup",
    tierLabel: "Setup & account",
    keywords: ["install", "email"],
  },
  {
    slug: "capturing-notes",
    title: "Capturing notes",
    description: "Add photos, documents, and field updates.",
    tier: "everyday",
    tierLabel: "Everyday tasks",
    keywords: ["voice", "photo"],
  },
  {
    slug: "voice-notes",
    title: "Voice notes",
    description: "Record an update from the jobsite.",
    tier: "everyday",
    tierLabel: "Everyday tasks",
    keywords: ["recording"],
  },
  {
    slug: "finalize-export-share",
    title: "Finalize, export, and share",
    description: "Create and share a file from your device.",
    tier: "core",
    tierLabel: "Core workflows",
    keywords: ["pdf", "save"],
  },
];

describe("searchGuides", () => {
  it("returns all guides for an empty query", () => {
    expect(searchGuides(entries, "")).toEqual(entries);
  });

  it("ranks title matches before keyword and description matches", () => {
    expect(searchGuides(entries, "voice").map((entry) => entry.slug)).toEqual([
      "voice-notes",
      "capturing-notes",
      "getting-started",
    ]);
  });

  it("matches case-insensitively and returns no unrelated guides", () => {
    expect(searchGuides(entries, "PDF")[0]?.slug).toBe(
      "finalize-export-share",
    );
    expect(searchGuides(entries, "fax machine")).toEqual([]);
  });
});
