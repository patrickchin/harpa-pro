import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';

import {
  DOUBLE_TAP_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  ZOOMED_THRESHOLD,
  ZoomableImage,
  clampScale,
  clampTranslation,
  isZoomedScale,
  nextDoubleTapScale,
} from './ZoomableImage';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) =>
    React.createElement('rn-expo-image', props, null),
}));

vi.mock('react-native-gesture-handler', () => {
  const makeGesture = () => {
    const gesture: Record<string, unknown> = {
      numberOfTaps: () => gesture,
      requireExternalGestureToFail: () => gesture,
      onBegin: () => gesture,
      onUpdate: () => gesture,
      onEnd: () => gesture,
      enabled: () => gesture,
    };
    return gesture;
  };
  return {
    Gesture: {
      Tap: makeGesture,
      Pinch: makeGesture,
      Pan: makeGesture,
      Race: (...gestures: unknown[]) => ({ type: 'race', gestures }),
      Exclusive: (...gestures: unknown[]) => ({ type: 'exclusive', gestures }),
      Simultaneous: (...gestures: unknown[]) => ({ type: 'simultaneous', gestures }),
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      React.createElement('rn-gesture-detector', null, children),
  };
});

vi.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'rn-animated-view' },
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  useAnimatedStyle: (fn: () => unknown) => fn(),
  useSharedValue: (value: unknown) => ({ value }),
  withSpring: (value: unknown) => value,
  withTiming: (value: unknown) => value,
}));

describe('ZoomableImage math', () => {
  it('clamps scale to the supported range', () => {
    expect(clampScale(0.25)).toBe(MIN_SCALE);
    expect(clampScale(2)).toBe(2);
    expect(clampScale(9)).toBe(MAX_SCALE);
  });

  it('toggles double-tap scale between reset and zoomed states', () => {
    expect(nextDoubleTapScale(MIN_SCALE)).toBe(DOUBLE_TAP_SCALE);
    expect(nextDoubleTapScale(ZOOMED_THRESHOLD + 0.1)).toBe(MIN_SCALE);
  });

  it('detects the zoomed threshold', () => {
    expect(isZoomedScale(1)).toBe(false);
    expect(isZoomedScale(ZOOMED_THRESHOLD)).toBe(false);
    expect(isZoomedScale(ZOOMED_THRESHOLD + 0.01)).toBe(true);
  });

  it('clamps translation so image edges do not reveal backdrop', () => {
    expect(clampTranslation(200, 2, 300)).toBe(150);
    expect(clampTranslation(-200, 2, 300)).toBe(-150);
    expect(clampTranslation(40, 2, 300)).toBe(40);
    expect(clampTranslation(40, 1, 300)).toBe(0);
  });
});

describe('ZoomableImage render', () => {
  it('renders CachedImage with full and placeholder cache keys', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <ZoomableImage
          source={{ uri: 'https://r2.example.com/full.jpg' }}
          placeholder={{ uri: 'https://r2.example.com/thumb.jpg' }}
          cacheKey="fil_full"
          placeholderCacheKey="fil_thumb"
          width={300}
          height={400}
          accessibilityLabel="Preview"
        />,
      );
    });

    const img = tree!.root.findByType('rn-expo-image' as any);
    expect(img.props.source).toEqual({
      uri: 'https://r2.example.com/full.jpg',
      cacheKey: 'fil_full',
    });
    expect(img.props.placeholder).toEqual({
      uri: 'https://r2.example.com/thumb.jpg',
      cacheKey: 'fil_thumb',
    });
    expect(img.props.accessibilityLabel).toBe('Preview');
  });
});
