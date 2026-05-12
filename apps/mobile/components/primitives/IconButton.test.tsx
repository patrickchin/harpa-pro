import { describe, expect, it } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { IconButton } from './IconButton';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

const Dot = () => null;

describe('IconButton', () => {
  it('renders the default outline / default / square configuration', () => {
    const tree = render(
      <IconButton onPress={() => {}} accessibilityLabel="Close">
        <Dot />
      </IconButton>,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders each variant', () => {
    for (const variant of ['outline', 'ghost', 'muted', 'primary', 'destructive'] as const) {
      const tree = render(
        <IconButton variant={variant} onPress={() => {}} accessibilityLabel={variant}>
          <Dot />
        </IconButton>,
      );
      expect(tree.toJSON()).toMatchSnapshot(variant);
    }
  });

  it('renders each size in square and circle shape', () => {
    for (const size of ['xs', 'sm', 'default'] as const) {
      for (const shape of ['square', 'circle'] as const) {
        const tree = render(
          <IconButton size={size} shape={shape} onPress={() => {}} accessibilityLabel={`${size}-${shape}`}>
            <Dot />
          </IconButton>,
        );
        expect(tree.toJSON()).toMatchSnapshot(`${size}-${shape}`);
      }
    }
  });

  it('applies the disabled opacity', () => {
    const tree = render(
      <IconButton disabled onPress={() => {}} accessibilityLabel="Disabled">
        <Dot />
      </IconButton>,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
