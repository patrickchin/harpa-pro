import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DocsSearch } from "./DocsSearch";

describe("DocsSearch", () => {
  it("server-renders an accessible search field and guide links", () => {
    const html = renderToStaticMarkup(
      <DocsSearch
        entries={[
          {
            slug: "getting-started",
            title: "Getting started",
            description: "Install the app and sign in.",
            category: "start",
            categoryLabel: "Start here",
            keywords: ["install"],
          },
        ]}
      />,
    );

    expect(html).toContain('for="docs-search"');
    expect(html).toContain('id="docs-search"');
    expect(html).toContain('href="/docs/guides/getting-started"');
    expect(html).toContain('aria-live="polite"');
  });
});
