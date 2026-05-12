import { describe, expect, it } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { InlineNotice } from './InlineNotice';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('InlineNotice', () => {
  it.each(['info', 'success', 'warning', 'danger'] as const)('renders %s tone', (tone) => {
    const tree = render(<InlineNotice tone={tone}>Body copy.</InlineNotice>);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders an optional title', () => {
    const tree = render(
      <InlineNotice tone="warning" title="Heads up">
        Take care.
      </InlineNotice>,
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Heads up');
  });
});
