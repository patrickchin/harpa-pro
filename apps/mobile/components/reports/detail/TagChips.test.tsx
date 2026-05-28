import { describe, it, expect } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { TagChips } from '@/components/reports/detail/TagChips';

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

describe('TagChips', () => {
  it('renders null for empty array', () => {
    const tree = render(<TagChips tags={[]} />);
    expect(tree.toJSON()).toBeNull();
  });

  it('renders null for null tags', () => {
    const tree = render(<TagChips tags={null} />);
    expect(tree.toJSON()).toBeNull();
  });

  it('renders each tag with # prefix', () => {
    const tree = render(<TagChips tags={['safety', 'foundation']} />);
    const text = collectText(tree.toJSON());
    expect(text).toContain('#safety');
    expect(text).toContain('#foundation');
  });

  it('renders a single tag correctly', () => {
    const tree = render(<TagChips tags={['inspection']} />);
    expect(collectText(tree.toJSON())).toContain('#inspection');
  });
});
