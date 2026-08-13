import { describe, expect, it } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import type React from 'react';

import { WorkersCard } from '@/components/reports/WorkersCard';

function render(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(el);
  });
  return tree;
}

function collectText(n: unknown): string {
  if (n == null) return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(collectText).join(' ');
  const node = n as { children?: unknown };
  if (node.children !== undefined) return collectText(node.children);
  return '';
}

describe('WorkersCard', () => {
  it('renders free-text headcounts from generated reports', () => {
    const tree = render(
      <WorkersCard
        workers={[{ role: 'Contractors', count: 'a few', hours: null, notes: null }]}
      />,
    );
    const text = collectText(tree.toJSON());

    expect(text).toContain('Contractors');
    expect(text).toContain('a few');
    expect(text).not.toContain('NaN');
  });

  it('renders each worker note once', () => {
    const tree = render(
      <WorkersCard
        workers={[
          {
            role: 'Carpenter',
            count: '4',
            hours: '8',
            notes: 'Formwork on grid B.',
          },
        ]}
      />,
    );
    const text = collectText(tree.toJSON());

    expect(text.match(/Formwork on grid B\./g)).toHaveLength(1);
  });
});
