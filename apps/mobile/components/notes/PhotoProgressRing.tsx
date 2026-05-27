/**
 * PhotoProgressRing — circular SVG progress indicator used by
 * `<PhotoTile>` to surface byte-uploaded progress during the
 * `presigning` → `uploading` window. The ring is hidden during the
 * `registering` / `creating_note` finalizing tail (progress already
 * == 1 but the server round-trip is still in flight) — the caller
 * passes `progress={undefined}` and renders a pulse on the dim
 * overlay instead.
 *
 * 28 × 28 px, 3 px stroke. Background ring = `border-foreground/20`,
 * foreground arc = `border-primary`. The arc animates clockwise from
 * 12 o'clock via `strokeDashoffset` driven by a Reanimated worklet so
 * frequent queue snapshots don't re-render the parent card.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '@/lib/design-tokens/colors';

const SIZE = 28;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface PhotoProgressRingProps {
  /** [0..1]. `undefined` hides the ring entirely (finalizing tail). */
  progress: number | undefined;
  testID?: string;
}

export function PhotoProgressRing({ progress, testID }: PhotoProgressRingProps) {
  const hasProgress = progress !== undefined;
  const clamped = hasProgress ? Math.max(0, Math.min(1, progress)) : 0;
  const pct = Math.round(clamped * 100);

  const offset = useSharedValue(CIRCUMFERENCE);
  useEffect(() => {
    if (!hasProgress) return;
    offset.value = withTiming(CIRCUMFERENCE * (1 - clamped), { duration: 150 });
  }, [clamped, hasProgress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: offset.value,
  }));

  if (!hasProgress) return null;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: pct, min: 0, max: 100 }}
      accessibilityLabel={`Uploading photo, ${pct} percent`}
      testID={testID}
      style={{ width: SIZE, height: SIZE }}
    >
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.border}
          strokeWidth={STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.primary.DEFAULT}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          animatedProps={animatedProps}
        />
      </Svg>
    </View>
  );
}
