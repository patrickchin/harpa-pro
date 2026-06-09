import { Pressable, ScrollView, Text, View } from 'react-native';
import { Images } from 'lucide-react-native';

import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import { colors } from '@/lib/design-tokens/colors';
import type { PhotoGroup } from '@/lib/reports/photo-placements';

interface PhotoAttachmentPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  targetLabel: string;
  groups: ReadonlyArray<PhotoGroup>;
  onSelect: (noteId: string) => void;
  testID?: string;
}

export function PhotoAttachmentPickerSheet({
  visible,
  onClose,
  targetLabel,
  groups,
  onSelect,
  testID,
}: PhotoAttachmentPickerSheetProps) {
  return (
    <AppDialogSheet
      visible={visible}
      title="Add attachments"
      message={`Choose a photo group to add to ${targetLabel}.`}
      onClose={onClose}
      actions={[
        {
          label: 'Cancel',
          onPress: onClose,
          variant: 'quiet',
          testID: 'btn-attachment-picker-cancel',
        },
      ]}
    >
      <View testID={testID ?? 'attachment-picker-sheet'}>
        {groups.length === 0 ? (
          <Text className="px-1 py-3 text-sm text-muted-foreground">
            There are no unplaced photo groups to add.
          </Text>
        ) : (
          <ScrollView className="max-h-96">
            <View className="gap-1">
              {groups.map((group) => (
                <Pressable
                  key={group.noteId}
                  onPress={() => onSelect(group.noteId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${group.title} to ${targetLabel}`}
                  testID={`attachment-picker-group-${group.noteId}`}
                  className="flex-row items-center gap-2.5 rounded-md border border-border bg-background px-3 py-2.5"
                >
                  <Images size={16} color={colors.foreground} />
                  <View className="min-w-0 flex-1">
                    <Text
                      className="text-base font-medium text-foreground"
                      numberOfLines={1}
                    >
                      {group.title}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {group.photos.length === 1
                        ? '1 photo'
                        : `${group.photos.length} photos`}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </AppDialogSheet>
  );
}
