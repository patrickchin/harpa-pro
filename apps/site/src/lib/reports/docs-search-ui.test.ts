// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it } from 'vitest';

import type { DocsSearchEntry } from './docs-search';
import { initDocsSearch } from './docs-search-ui';

const here = dirname(fileURLToPath(import.meta.url));

const entries: DocsSearchEntry[] = [
  {
    slug: 'capture-notes-voice',
    title: 'Capture notes, photos, and voice notes',
    description: 'Add text, photos, and voice notes to a draft.',
    tier: 'everyday',
    tierLabel: 'Everyday tasks',
    keywords: ['voice', 'photo'],
  },
  {
    slug: 'collaborate-members',
    title: 'Add members to a project',
    description: 'Invite teammates.',
    tier: 'everyday',
    tierLabel: 'Everyday tasks',
    keywords: ['members', 'invite'],
  },
];

function mount(): HTMLElement {
  document.body.innerHTML = `
    <div class="docs-search" data-docs-search>
      <label for="docs-search">Search guides</label>
      <input id="docs-search" type="search" />
      <div data-docs-search-status aria-live="polite"></div>
      <div data-docs-search-results></div>
    </div>`;
  const root = document.querySelector<HTMLElement>('[data-docs-search]')!;
  root.dataset.docsSearchEntries = JSON.stringify(entries);
  return root;
}

function type(value: string) {
  const input = document.querySelector<HTMLInputElement>('#docs-search')!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const status = () => document.querySelector('[data-docs-search-status]')!;
const results = () => document.querySelector('[data-docs-search-results]')!;

describe('DocsSearch component markup', () => {
  it('server-renders an accessible field without hydrating React or duplicating the guide grid', () => {
    const source = readFileSync(
      resolve(here, '../../components/reports/docs/DocsSearch.astro'),
      'utf8',
    );
    expect(source).toContain('for="docs-search"');
    expect(source).toContain('id="docs-search"');
    expect(source).toMatch(/data-docs-search-status\s+aria-live="polite"><\/div>/);
    expect(source).not.toContain('docs-guide-grid');
    expect(source).not.toMatch(/from ["']react["']/);

    const index = readFileSync(resolve(here, '../../pages/reports/docs/index.astro'), 'utf8');
    expect(index).not.toContain('client:');
  });
});

describe('initDocsSearch', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('stays quiet before a query', () => {
    initDocsSearch(mount());
    expect(status().textContent).toBe('');
    expect(results().children).toHaveLength(0);
  });

  it('announces the result count and renders matching guide links', () => {
    initDocsSearch(mount());
    type('voice');

    expect(status().textContent).toBe('1 guide');
    const links = Array.from(results().querySelectorAll('a'));
    expect(links.map((link) => link.textContent)).toEqual([
      'Capture notes, photos, and voice notes',
    ]);
    expect(links[0]?.getAttribute('href')).toBe('/reports/docs/guides/capture-notes-voice');

    type('e');
    expect(status().textContent).toBe('2 guides');
  });

  it('shows an empty state whose clear button resets the search', () => {
    initDocsSearch(mount());
    type('fax machine');

    expect(status().textContent).toBe('0 guides');
    expect(results().querySelector('h2')?.textContent).toBe('No matching guides');
    expect(results().querySelector('a')?.getAttribute('href')).toBe(
      'mailto:patrick@harpapro.com',
    );

    results().querySelector('button')!.click();
    const input = document.querySelector<HTMLInputElement>('#docs-search')!;
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(status().textContent).toBe('');
    expect(results().children).toHaveLength(0);
  });

  it('renders a query typed before initialization and only binds once', () => {
    const root = mount();
    document.querySelector<HTMLInputElement>('#docs-search')!.value = 'members';
    initDocsSearch(root);
    initDocsSearch(root);

    expect(status().textContent).toBe('1 guide');
    type('');
    expect(results().children).toHaveLength(0);
  });

  it('renders guide text as text, not HTML', () => {
    const root = mount();
    root.dataset.docsSearchEntries = JSON.stringify([
      { ...entries[0], title: '<img src=x onerror=alert(1)> voice' },
    ]);
    initDocsSearch(root);
    type('voice');
    expect(results().querySelector('img')).toBeNull();
  });
});
