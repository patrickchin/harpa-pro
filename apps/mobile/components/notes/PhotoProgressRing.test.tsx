import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, create } from 'react-test-renderer';

vi.mock('react-native-svg', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) =>
    React.createElement('rn-svg', props, (props as { children?: React.ReactNode }).children),
  Svg: (props: Record<string, unknown>) =>
    React.createElement('rn-svg', props, (props as { children?: React.ReactNode }).children),
  Circle: (props: Record<string, unknown>) =>
    React.createElement('rn-svg-circle', props, null),
}));

vi.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { createAnimatedComponent: (C: unknown) => C },
  useSharedValue: (v: number) => ({ value: v }),
  useAnimatedProps: (fn: () => unknown) => fn(),
  withTiming: (v: number) => v,
}));

import { PhotoProgressRing } from './PhotoProgressRing';

// Note: react-test-renderer's findByProps uses { deep: false } which short-circuits
// at the root component instance (PhotoProgressRing itself). We use toJSON() instead
// to inspect the rendered host element tree, which correctly reflects what the user sees.
describe('PhotoProgressRing', () => {
  it('renders an accessible progressbar with the rounded percent value', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<PhotoProgressRing progress={0.42} testID="ring" />);
    });
    // toJSON() returns the host element (rn-View) with all props
    const json = tree!.toJSON() as { props: Record<string, unknown> } | null;
    expect(json).not.toBeNull();
    expect(json!.props.accessibilityRole).toBe('progressbar');
    expect(json!.props.accessibilityValue).toEqual({ now: 42, min: 0, max: 100 });
  });

  it('clamps progress to [0, 1]', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<PhotoProgressRing progress={1.6} testID="ring" />);
    });
    const json = tree!.toJSON() as { props: Record<string, unknown> } | null;
    expect(json).not.toBeNull();
    expect(json!.props.accessibilityValue).toEqual({ now: 100, min: 0, max: 100 });
  });

  it('returns null when progress is undefined (finalizing tail)', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<PhotoProgressRing progress={undefined} testID="ring" />);
    });
    // Component renders null → toJSON() is null (no host elements rendered)
    expect(tree!.toJSON()).toBeNull();
  });
});
