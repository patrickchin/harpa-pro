import { describe, expect, it } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { StatTile } from './StatTile';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('StatTile', () => {
  it('renders default tone', () => {
    const tree = render(<StatTile value={12} label="reports" />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders warning tone', () => {
    const tree = render(<StatTile value="3" label="overdue" tone="warning" />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders danger tone', () => {
    const tree = render(<StatTile value={0} label="failed" tone="danger" />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders success tone', () => {
    const tree = render(<StatTile value={42} label="done" tone="success" />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders compact min-height', () => {
    const tree = render(<StatTile value={5} label="open" compact />);
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
