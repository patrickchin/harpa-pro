import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DocsSearch } from "./DocsSearch";

describe("DocsSearch", () => {
  it("server-renders an accessible search field without a duplicate guide grid", () => {
    const html = renderToStaticMarkup(
      <DocsSearch
        entries={[
          {
            slug: "getting-started",
            title: "Getting started",
            description: "Install the app and sign in.",
            tier: "setup",
            tierLabel: "Setup & account",
            keywords: ["install"],
          },
        ]}
      />,
    );

    expect(html).toContain('for="docs-search"');
    expect(html).toContain('id="docs-search"');
    expect(html).not.toContain('href="/docs/guides/getting-started"');
    expect(html).not.toContain('aria-live="polite"');
  });
});
