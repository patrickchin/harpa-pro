import { describe, expect, it } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { Skeleton, SkeletonRow } from './Skeleton';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('Skeleton', () => {
  it('renders default block', () => {
    const tree = render(<Skeleton />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders fixed width + height', () => {
    const tree = render(<Skeleton width={120} height={24} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders circle (forces width to height)', () => {
    const tree = render(<Skeleton height={48} circle />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('respects radius override', () => {
    const tree = render(<Skeleton height={20} radius={12} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });
});

describe('SkeletonRow', () => {
  it('renders children inside a flex-row container', () => {
    const tree = render(
      <SkeletonRow>
        <Skeleton width={40} height={40} circle />
        <Skeleton height={16} />
      </SkeletonRow>,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
