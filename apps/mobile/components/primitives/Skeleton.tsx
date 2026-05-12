/**
 * Skeleton primitive. Ported from
 * `../haru3-reports/apps/mobile/components/ui/Skeleton.tsx` on branch
 * `dev`.
 *
 * Pulsing opacity (no gradient sweep) keeps it dependency-light and
 * platform-agnostic. Uses `react-native-reanimated` shared values; the
 * Vitest mock in `vitest.setup.ts` stubs these so snapshot tests still
 * produce a deterministic host tree.
 */
import { useEffect } from 'react';
import { View, type ViewProps, type DimensionValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';

import { cn } from '@/lib/utils';

export interface SkeletonProps extends ViewProps {
  /** Width — number (px) or string ("100%"). Defaults to "100%". */
  width?: DimensionValue;
  /** Height in px. Defaults to 16. */
  height?: number;
  /** Fully round (circle). Width is forced to match height. */
  circle?: boolean;
  /** Border radius override (ignored when `circle` is true). */
  radius?: number;
  className?: string;
}

export function Skeleton({
  width = '100%',
  height = 16,
  circle = false,
  radius,
  className,
  style,
  ...props
}: SkeletonProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.35, 0.7]),
  }));

  const resolvedRadius = circle ? (typeof height === 'number' ? height / 2 : 999) : (radius ?? 6);
  const resolvedWidth = circle ? height : width;

  return (
    <Animated.View
      {...props}
      className={cn('bg-muted', className)}
      style={[
        {
          width: resolvedWidth,
          height,
          borderRadius: resolvedRadius,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function SkeletonRow({
  children,
  className,
  ...props
}: ViewProps & { className?: string }) {
  return (
    <View className={cn('flex-row items-center gap-3', className)} {...props}>
      {children}
    </View>
  );
}
