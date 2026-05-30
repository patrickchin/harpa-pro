import { describe, it, expect } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { SummaryLead } from '@/components/reports/detail/SummaryLead';

function render(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(el);
  });
  return tree;
}

function collectText(n: any): string {
  if (n == null) return '';
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map(collectText).join(' ');
  if (n.children) return collectText(n.children);
  return '';
}

describe('SummaryLead', () => {
  it('renders null when summary is null', () => {
    const tree = render(<SummaryLead summary={null} />);
    expect(tree.toJSON()).toBeNull();
  });

  it('renders null when summary is empty string', () => {
    const tree = render(<SummaryLead summary="" />);
    expect(tree.toJSON()).toBeNull();
  });

  it('renders null when summary is whitespace only', () => {
    const tree = render(<SummaryLead summary="   " />);
    expect(tree.toJSON()).toBeNull();
  });

  it('renders the summary text when provided', () => {
    const tree = render(
      <SummaryLead summary="Steady progress on east footing." />,
    );
    expect(collectText(tree.toJSON())).toContain(
      'Steady progress on east footing.',
    );
  });
});
