import { describe, expect, it } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { View } from 'react-native';

import { EmptyState } from './EmptyState';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('EmptyState', () => {
  it('renders title + description only', () => {
    const tree = render(<EmptyState title="No reports yet" description="Add one to begin." />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders icon slot when provided', () => {
    const tree = render(
      <EmptyState
        icon={<View testID="icon-slot" />}
        title="Empty"
        description="Nothing here."
      />,
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('icon-slot');
  });

  it('renders action slot when provided', () => {
    const tree = render(
      <EmptyState
        title="Empty"
        description="Nothing here."
        action={<View testID="cta-slot" />}
      />,
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('cta-slot');
  });
});
