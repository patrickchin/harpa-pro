/**
 * PhotoPlacementChip — small inline chip rendered next to a photo
 * group on the report tab. Tapping it opens `PhotoGroupPlacementSheet`
 * so the user can attach (or detach) the group to a specific issue or
 * detailed section of the report.
 *
 * Two visual states:
 *  - Unplaced (no `placement`): muted "Place into…" hint with a
 *    `MapPin` icon. Signals the chip is actionable but the group
 *    currently lives in the bottom photo strip.
 *  - Placed: solid chip with the target's title + a "Change…" affordance
 *    on press. The chip itself is the only interactive surface — keeps
 *    the touch target obvious and avoids an `Alert.alert` confirm step
 *    (Pitfall 12).
 */
import { Pressable, Text, View } from 'react-native';
import { MapPin } from 'lucide-react-native';

import { colors } from '@/lib/design-tokens/colors';

export interface PhotoPlacementChipProps {
  /** Display label of the current placement target. Null = unplaced. */
  placedLabel: string | null;
  onPress: () => void;
  testID?: string;
  /** Optional accessibility label override (defaults to a sensible string). */
  accessibilityLabel?: string;
}

export function PhotoPlacementChip({
  placedLabel,
  onPress,
  testID,
  accessibilityLabel,
}: PhotoPlacementChipProps) {
  const isPlaced = placedLabel !== null;
  const a11y =
    accessibilityLabel ??
    (isPlaced
      ? `Placed in ${placedLabel}. Tap to change.`
      : 'Place this photo group into an issue or section.');

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={8}
      className={`self-start flex-row items-center gap-1.5 rounded-full border px-2.5 py-1 ${
        isPlaced
          ? 'border-primary/40 bg-primary/10'
          : 'border-border bg-secondary'
      }`}
    >
      <MapPin
        size={12}
        color={isPlaced ? colors.primary.DEFAULT : colors.muted.foreground}
      />
      <Text
        className={`text-xs font-medium ${
          isPlaced ? 'text-primary' : 'text-muted-foreground'
        }`}
        numberOfLines={1}
      >
        {isPlaced ? placedLabel : 'Place into…'}
      </Text>
    </Pressable>
  );
}
