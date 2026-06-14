import { Plus } from 'lucide-react-native';

import { IconButton } from '@/components/primitives/IconButton';
import { colors } from '@/lib/design-tokens/colors';

interface AddAttachmentsButtonProps {
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
}

export function AddAttachmentsButton({
  onPress,
  testID,
  accessibilityLabel = 'Add attachments',
  disabled = false,
}: AddAttachmentsButtonProps) {
  return (
    <IconButton
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      variant="outline"
      size="sm"
      shape="square"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
    >
      <Plus size={16} color={colors.muted.foreground} />
    </IconButton>
  );
}
