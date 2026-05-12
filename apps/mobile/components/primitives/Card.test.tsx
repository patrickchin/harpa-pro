import { describe, expect, it } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

import { Card } from './Card';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('Card', () => {
  it('renders the default variant with default padding', () => {
    const tree = render(
      <Card>
        <Text>Card body</Text>
      </Card>,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders every variant', () => {
    for (const variant of ['default', 'muted', 'emphasis', 'danger'] as const) {
      const tree = render(
        <Card variant={variant}>
          <Text>{variant}</Text>
        </Card>,
      );
      expect(tree.toJSON()).toMatchSnapshot(variant);
    }
  });

  it('renders every padding step', () => {
    for (const padding of ['sm', 'md', 'lg'] as const) {
      const tree = render(
        <Card padding={padding}>
          <Text>{padding}</Text>
        </Card>,
      );
      expect(tree.toJSON()).toMatchSnapshot(padding);
    }
  });

  it('respects an explicit depth override', () => {
    const tree = render(
      <Card depth="flat">
        <Text>flat</Text>
      </Card>,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
