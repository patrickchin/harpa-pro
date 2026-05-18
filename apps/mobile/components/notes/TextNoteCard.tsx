/**
 * TextNoteCard — one text note row in the timeline. Ported in
 * simplified form from
 * `../haru3-reports/apps/mobile/components/notes/TextNoteCard.tsx`
 * (branch `dev`). Shows a three-dot button that opens an options
 * dialog with Edit + Delete actions. Edit pops an inline textarea
 * dialog; Delete defers to the provider-owned delete-confirm
 * dialog via `onRemove(sourceIndex)`.
 *
 * Pending (optimistic) notes show a spinner instead of the options
 * button, matching canonical behaviour.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { MoreVertical } from 'lucide-react-native';

import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import { colors } from '@/lib/design-tokens/colors';
import type { NoteEntry } from '@/lib/note-entry';

export interface TextNoteCardProps {
  entry: NoteEntry;
  sourceIndex: number;
  authorName?: string;
  readOnly?: boolean;
  onRemove?: (sourceIndex: number) => void;
  onEdit?: (sourceIndex: number, nextBody: string) => void;
}

export function TextNoteCard({
  entry,
  sourceIndex,
  authorName,
  readOnly,
  onRemove,
  onEdit,
}: TextNoteCardProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(entry.text);

  useEffect(() => {
    setDraft(entry.text);
  }, [entry.text]);

  const canManage = !entry.isPending && !readOnly && Boolean(onRemove || onEdit);

  const handleEdit = () => {
    setOptionsOpen(false);
    setDraft(entry.text);
    setEditOpen(true);
  };

  const handleDelete = () => {
    setOptionsOpen(false);
    onRemove?.(sourceIndex);
  };

  const handleSubmitEdit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === entry.text) {
      setEditOpen(false);
      return;
    }
    onEdit?.(sourceIndex, trimmed);
    setEditOpen(false);
  };

  return (
    <>
      <View
        className="rounded-lg border border-border bg-card p-3"
        testID={`note-row-${sourceIndex}`}
      >
        <View className="flex-row items-start gap-2">
          <Text className="flex-1 text-base text-foreground" selectable>
            {entry.text}
          </Text>
          {canManage ? (
            <Pressable
              onPress={() => setOptionsOpen(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Note options"
              testID={`btn-text-note-options-${sourceIndex}`}
              className="h-7 w-7 items-center justify-center rounded-md"
            >
              <MoreVertical size={16} color={colors.muted.foreground} />
            </Pressable>
          ) : entry.isPending ? (
            <View
              className="h-7 w-7 items-center justify-center"
              testID={`text-note-pending-${sourceIndex}`}
            >
              <ActivityIndicator size="small" color={colors.muted.foreground} />
            </View>
          ) : null}
        </View>
        {authorName ? (
          <Text className="mt-1 text-xs text-muted-foreground">{authorName}</Text>
        ) : null}
      </View>

      <AppDialogSheet
        visible={optionsOpen}
        title="Note options"
        onClose={() => setOptionsOpen(false)}
        actions={[
          ...(onEdit
            ? [
                {
                  label: 'Edit',
                  variant: 'secondary' as const,
                  onPress: handleEdit,
                  accessibilityLabel: 'Edit note',
                  testID: `dialog-action-text-note-edit-${sourceIndex}`,
                },
              ]
            : []),
          ...(onRemove
            ? [
                {
                  label: 'Delete',
                  variant: 'destructive' as const,
                  onPress: handleDelete,
                  accessibilityLabel: 'Delete note',
                  testID: `dialog-action-text-note-delete-${sourceIndex}`,
                },
              ]
            : []),
          {
            label: 'Cancel',
            variant: 'quiet' as const,
            onPress: () => setOptionsOpen(false),
            accessibilityLabel: 'Cancel note options',
          },
        ]}
      />

      <AppDialogSheet
        visible={editOpen}
        title="Edit note"
        onClose={() => setEditOpen(false)}
        actions={[
          {
            label: 'Save',
            variant: 'default' as const,
            onPress: handleSubmitEdit,
            disabled: !draft.trim() || draft.trim() === entry.text,
            accessibilityLabel: 'Save note edits',
            testID: `dialog-action-text-note-save-${sourceIndex}`,
          },
          {
            label: 'Cancel',
            variant: 'quiet' as const,
            onPress: () => setEditOpen(false),
            accessibilityLabel: 'Cancel note edits',
          },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          autoFocus
          textAlignVertical="top"
          className="min-h-[96px] rounded-md border border-border bg-background p-3 text-base text-foreground"
          testID={`input-text-note-edit-${sourceIndex}`}
        />
      </AppDialogSheet>
    </>
  );
}
