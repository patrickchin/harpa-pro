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
    slug: "capture-notes-voice",
    title: "Capture notes, photos, and voice notes",
    description: "Add focused field updates to a draft report.",
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
    slug: "export-share-pdf",
    title: "Export and share a PDF",
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

  it("ranks matches by field and preserves input order for ties", () => {
    expect(searchGuides(entries, "voice").map((entry) => entry.slug)).toEqual([
      "capture-notes-voice",
      "voice-notes",
      "getting-started",
    ]);
  });

  it("matches case-insensitively and returns no unrelated guides", () => {
    expect(searchGuides(entries, "PDF")[0]?.slug).toBe(
      "export-share-pdf",
    );
    expect(searchGuides(entries, "fax machine")).toEqual([]);
  });
});
