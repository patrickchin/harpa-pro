import { Plus } from 'lucide-react-native';

import { IconButton } from '@/components/primitives/IconButton';
import { colors } from '@/lib/design-tokens/colors';

interface AddAttachmentsButtonProps {
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
}

export function AddAttachmentsButton({
  onPress,
  testID,
  accessibilityLabel = 'Add attachments',
}: AddAttachmentsButtonProps) {
  return (
    <IconButton
      onPress={onPress}
      testID={testID}
      variant="outline"
      size="sm"
      shape="square"
      accessibilityLabel={accessibilityLabel}
    >
      <Plus size={16} color={colors.muted.foreground} />
    </IconButton>
  );
}
