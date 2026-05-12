/**
 * Snapshot test for the Button primitive. Establishes the
 * react-native + react-test-renderer Vitest pattern that every
 * subsequent primitive reuses (see `apps/mobile/vitest.setup.ts`).
 *
 * Memory note `react19-testing.md`:
 *   - Synchronous `act(() => { tree = create(...) })` only.
 *   - Never set `globalThis.IS_REACT_ACT_ENVIRONMENT`.
 */
import { describe, expect, it } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { Button } from './Button';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('Button', () => {
  it('renders the default variant with a string label', () => {
    const tree = render(<Button onPress={() => {}}>Tap me</Button>);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders each variant', () => {
    for (const variant of ['default', 'secondary', 'destructive', 'outline', 'ghost', 'quiet', 'hero'] as const) {
      const tree = render(
        <Button variant={variant} onPress={() => {}}>
          {variant}
        </Button>,
      );
      expect(tree.toJSON()).toMatchSnapshot(variant);
    }
  });

  it('renders each size', () => {
    for (const size of ['default', 'sm', 'lg', 'xl', 'icon'] as const) {
      const tree = render(
        <Button size={size} onPress={() => {}}>
          {size}
        </Button>,
      );
      expect(tree.toJSON()).toMatchSnapshot(size);
    }
  });

  it('shows a spinner and disables the button when loading', () => {
    const tree = render(
      <Button loading onPress={() => {}}>
        Submitting
      </Button>,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('respects the disabled prop', () => {
    const tree = render(
      <Button disabled onPress={() => {}}>
        Cannot tap
      </Button>,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
