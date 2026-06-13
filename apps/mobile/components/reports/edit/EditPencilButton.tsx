/**
 * EditPencilButton - small outline icon button with a Pencil glyph.
 * Used as the trailing affordance on report read-view cards (and as
 * an inline per-row affordance on Issues + Detailed Section rows) to
 * open the per-card edit modal.
 */
import { Pencil } from 'lucide-react-native';

import { IconButton } from '@/components/primitives/IconButton';
import { colors } from '@/lib/design-tokens/colors';

interface EditPencilButtonProps {
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
  disabled?: boolean;
}

export function EditPencilButton({
  onPress,
  accessibilityLabel,
  testID,
  disabled = false,
}: EditPencilButtonProps) {
  return (
    <IconButton
      onPress={onPress}
      disabled={disabled}
      variant="outline"
      size="sm"
      shape="square"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      testID={testID}
    >
      <Pencil size={14} color={colors.muted.foreground} />
    </IconButton>
  );
}
