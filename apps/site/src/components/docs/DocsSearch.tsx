import { useMemo, useState } from "react";

import {
  searchGuides,
  type DocsSearchEntry,
} from "../../lib/docs-search";

interface DocsSearchProps {
  entries: readonly DocsSearchEntry[];
}

export function DocsSearch({ entries }: DocsSearchProps) {
  const [query, setQuery] = useState("");
  const hasQuery = query.trim().length > 0;
  const results = useMemo(
    () => (hasQuery ? searchGuides(entries, query) : []),
    [entries, hasQuery, query],
  );
  const resultLabel = `${results.length} ${results.length === 1 ? "guide" : "guides"}`;

  return (
    <div className="docs-search">
      <div className="docs-search-field">
        <label htmlFor="docs-search">Search guides</label>
        <input
          id="docs-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Try voice notes, PDF, or members"
          autoComplete="off"
        />
      </div>

      {hasQuery && (
        <>
          <p className="docs-search-count" aria-live="polite">
            {resultLabel}
          </p>

          {results.length > 0 ? (
            <div className="docs-guide-grid">
              {results.map((entry) => (
                <article className="docs-guide-card" key={entry.slug}>
                  <p>{entry.tierLabel}</p>
                  <h2>
                    <a href={`/docs/guides/${entry.slug}`}>{entry.title}</a>
                  </h2>
                  <span>{entry.description}</span>
                </article>
              ))}
            </div>
          ) : (
            <div className="docs-empty-state">
              <h2>No matching guides</h2>
              <p>Try a broader term or email us if you are stuck.</p>
              <div>
                <button type="button" onClick={() => setQuery("")}>
                  Clear search
                </button>
                <a href="mailto:patrick@harpapro.com">Contact support</a>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
