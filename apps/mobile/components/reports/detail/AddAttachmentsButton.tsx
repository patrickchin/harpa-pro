import { Pressable, Text } from 'react-native';
import { Plus } from 'lucide-react-native';

import { colors } from '@/lib/design-tokens/colors';

interface AddAttachmentsButtonProps {
  onPress: () => void;
  testID?: string;
}

export function AddAttachmentsButton({
  onPress,
  testID,
}: AddAttachmentsButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Add attachments"
      hitSlop={10}
      style={{ minHeight: 40 }}
      className="mt-3 self-start flex-row items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3.5 py-2"
    >
      <Plus size={16} color={colors.primary.DEFAULT} />
      <Text className="text-sm font-semibold text-primary">
        Add attachments
      </Text>
    </Pressable>
  );
}
