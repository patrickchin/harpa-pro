import { searchGuides, type DocsSearchEntry } from './docs-search';

export const DOCS_SEARCH_SUPPORT_EMAIL = 'patrick@harpapro.com';

function resultLabel(count: number): string {
  return `${count} ${count === 1 ? 'guide' : 'guides'}`;
}

function element<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderResults(doc: Document, results: readonly DocsSearchEntry[]): HTMLElement {
  const grid = element(doc, 'div', 'docs-guide-grid');
  for (const entry of results) {
    const card = element(doc, 'article', 'docs-guide-card');
    const heading = element(doc, 'h2');
    const link = element(doc, 'a', undefined, entry.title);
    link.href = `/reports/docs/guides/${entry.slug}`;
    heading.append(link);
    card.append(
      element(doc, 'p', undefined, entry.tierLabel),
      heading,
      element(doc, 'span', undefined, entry.description),
    );
    grid.append(card);
  }
  return grid;
}

function renderEmptyState(doc: Document, onClear: () => void): HTMLElement {
  const empty = element(doc, 'div', 'docs-empty-state');
  const actions = element(doc, 'div');
  const clear = element(doc, 'button', undefined, 'Clear search');
  clear.type = 'button';
  clear.addEventListener('click', onClear);
  const contact = element(doc, 'a', undefined, 'Contact support');
  contact.href = `mailto:${DOCS_SEARCH_SUPPORT_EMAIL}`;
  actions.append(clear, contact);
  empty.append(
    element(doc, 'h2', undefined, 'No matching guides'),
    element(doc, 'p', undefined, 'Try a broader term or email us if you are stuck.'),
    actions,
  );
  return empty;
}

/**
 * Wires a server-rendered `[data-docs-search]` root. The status region stays
 * in the DOM so screen readers announce result-count changes.
 */
export function initDocsSearch(root: HTMLElement): void {
  if (root.dataset.docsSearchReady === 'true') return;
  const doc = root.ownerDocument;
  const input = root.querySelector<HTMLInputElement>('input[type="search"]');
  const status = root.querySelector<HTMLElement>('[data-docs-search-status]');
  const results = root.querySelector<HTMLElement>('[data-docs-search-results]');
  if (!input || !status || !results) return;

  const entries = JSON.parse(root.dataset.docsSearchEntries ?? '[]') as DocsSearchEntry[];

  const clear = () => {
    input.value = '';
    update();
    input.focus();
  };

  function update() {
    const query = input!.value;
    if (query.trim().length === 0) {
      status!.replaceChildren();
      results!.replaceChildren();
      return;
    }

    const matches = searchGuides(entries, query);
    const count = element(doc, 'p', 'docs-search-count', resultLabel(matches.length));
    status!.replaceChildren(count);
    results!.replaceChildren(
      matches.length > 0 ? renderResults(doc, matches) : renderEmptyState(doc, clear),
    );
  }

  input.addEventListener('input', update);
  root.dataset.docsSearchReady = 'true';
  // Restore results when the browser preserved a typed query (back/forward).
  update();
}
