import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { CachedImage } from '@/components/ui/CachedImage';

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const DOUBLE_TAP_SCALE = 2.5;
export const ZOOMED_THRESHOLD = 1.1;

export interface ZoomableImageProps {
  source: { uri: string };
  placeholder?: { uri: string };
  cacheKey?: string;
  placeholderCacheKey?: string;
  width: number;
  height: number;
  contentFit?: 'contain' | 'cover';
  onZoomChange?: (isZoomed: boolean) => void;
  onSingleTap?: () => void;
  onLoad?: (event: { source?: { width?: number; height?: number } }) => void;
  accessibilityLabel?: string;
  testID?: string;
}

export function clampScale(value: number): number {
  'worklet';
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export function nextDoubleTapScale(currentScale: number): number {
  'worklet';
  return currentScale > ZOOMED_THRESHOLD ? MIN_SCALE : DOUBLE_TAP_SCALE;
}

export function isZoomedScale(value: number): boolean {
  'worklet';
  return value > ZOOMED_THRESHOLD;
}

export function clampTranslation(
  value: number,
  scale: number,
  viewportSize: number,
): number {
  'worklet';
  if (scale <= MIN_SCALE) return 0;
  const max = ((scale - MIN_SCALE) * viewportSize) / 2;
  return Math.min(max, Math.max(-max, value));
}

function anchoredTranslation(
  currentTranslation: number,
  currentScale: number,
  nextScale: number,
  focalCoordinate: number,
  viewportSize: number,
): number {
  'worklet';
  if (nextScale <= MIN_SCALE) return 0;
  const focalFromCenter = focalCoordinate - viewportSize / 2;
  const ratio = nextScale / Math.max(currentScale, MIN_SCALE);
  return clampTranslation(
    currentTranslation * ratio + focalFromCenter * (1 - ratio),
    nextScale,
    viewportSize,
  );
}

export function ZoomableImage({
  source,
  placeholder,
  cacheKey,
  placeholderCacheKey,
  width,
  height,
  contentFit = 'contain',
  onZoomChange,
  onSingleTap,
  onLoad,
  accessibilityLabel,
  testID = 'zoomable-image',
}: ZoomableImageProps) {
  const [panEnabled, setPanEnabled] = useState(false);
  const scale = useSharedValue(MIN_SCALE);
  const startScale = useSharedValue(MIN_SCALE);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startTranslateX = useSharedValue(0);
  const startTranslateY = useSharedValue(0);
  const wasZoomed = useSharedValue(false);

  const reportZoomed = useCallback(
    (nextZoomed: boolean) => {
      setPanEnabled(nextZoomed);
      onZoomChange?.(nextZoomed);
    },
    [onZoomChange],
  );

  const maybeReportZoomed = useCallback(
    (nextScale: number) => {
      'worklet';
      const nextZoomed = isZoomedScale(nextScale);
      if (nextZoomed !== wasZoomed.value) {
        wasZoomed.value = nextZoomed;
        runOnJS(reportZoomed)(nextZoomed);
      }
    },
    [reportZoomed],
  );

  const reset = useCallback(() => {
    'worklet';
    const timing = { duration: 200 };
    scale.value = withTiming(MIN_SCALE, timing);
    translateX.value = withTiming(0, timing);
    translateY.value = withTiming(0, timing);
    maybeReportZoomed(MIN_SCALE);
  }, [maybeReportZoomed, scale, translateX, translateY]);

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd((event, success) => {
          if (!success) return;
          const nextScale = nextDoubleTapScale(scale.value);
          if (nextScale === MIN_SCALE) {
            reset();
            return;
          }
          const timing = { duration: 200 };
          translateX.value = withTiming(
            anchoredTranslation(0, MIN_SCALE, nextScale, event.x, width),
            timing,
          );
          translateY.value = withTiming(
            anchoredTranslation(0, MIN_SCALE, nextScale, event.y, height),
            timing,
          );
          scale.value = withTiming(nextScale, timing);
          maybeReportZoomed(nextScale);
        }),
    [height, maybeReportZoomed, reset, scale, translateX, translateY, width],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          startScale.value = scale.value;
          startTranslateX.value = translateX.value;
          startTranslateY.value = translateY.value;
        })
        .onUpdate((event) => {
          const nextScale = clampScale(startScale.value * event.scale);
          scale.value = nextScale;
          translateX.value = anchoredTranslation(
            startTranslateX.value,
            startScale.value,
            nextScale,
            event.focalX,
            width,
          );
          translateY.value = anchoredTranslation(
            startTranslateY.value,
            startScale.value,
            nextScale,
            event.focalY,
            height,
          );
          maybeReportZoomed(nextScale);
        })
        .onEnd(() => {
          if (scale.value < ZOOMED_THRESHOLD) reset();
        }),
    [
      height,
      maybeReportZoomed,
      reset,
      scale,
      startScale,
      startTranslateX,
      startTranslateY,
      translateX,
      translateY,
      width,
    ],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(panEnabled)
        .onBegin(() => {
          startTranslateX.value = translateX.value;
          startTranslateY.value = translateY.value;
        })
        .onUpdate((event) => {
          translateX.value = clampTranslation(
            startTranslateX.value + event.translationX,
            scale.value,
            width,
          );
          translateY.value = clampTranslation(
            startTranslateY.value + event.translationY,
            scale.value,
            height,
          );
        }),
    [
      height,
      panEnabled,
      scale,
      startTranslateX,
      startTranslateY,
      translateX,
      translateY,
      width,
    ],
  );

  const singleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(1)
        .requireExternalGestureToFail(doubleTap, pinch)
        .onEnd((_event, success) => {
          if (success && onSingleTap) runOnJS(onSingleTap)();
        }),
    [doubleTap, onSingleTap, pinch],
  );

  const composedGesture = useMemo(
    () =>
      Gesture.Race(
        Gesture.Exclusive(doubleTap, singleTap),
        Gesture.Simultaneous(pinch, pan),
      ),
    [doubleTap, pan, pinch, singleTap],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <View
        className="items-center justify-center overflow-hidden"
        style={{ width, height }}
        testID={testID}
      >
        <Animated.View style={animatedStyle}>
          <CachedImage
            source={source}
            placeholder={placeholder}
            cacheKey={cacheKey}
            placeholderCacheKey={placeholderCacheKey}
            style={{ width, height }}
            contentFit={contentFit}
            accessibilityLabel={accessibilityLabel}
            onLoad={onLoad}
            testID={`${testID}-image`}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
