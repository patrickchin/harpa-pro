export interface DocsSearchEntry {
  slug: string;
  title: string;
  description: string;
  tier: string;
  tierLabel: string;
  keywords: string[];
}

export function searchGuides(
  entries: readonly DocsSearchEntry[],
  rawQuery: string,
): DocsSearchEntry[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return [...entries];

  return entries
    .map((entry, index) => {
      const title = entry.title.toLocaleLowerCase();
      const keywords = entry.keywords.join(" ").toLocaleLowerCase();
      const description = entry.description.toLocaleLowerCase();
      const score =
        (title.includes(query) ? 30 : 0) +
        (keywords.includes(query) ? 20 : 0) +
        (description.includes(query) ? 10 : 0);

      return { entry, score, index };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ entry }) => entry);
}
