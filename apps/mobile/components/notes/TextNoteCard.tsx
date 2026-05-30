/**
 * TextNoteCard — one text note row in the timeline. Ported in
 * simplified form from
 * `../haru3-reports/apps/mobile/components/notes/TextNoteCard.tsx`
 * (branch `dev`). Shows a three-dot button that opens the shared
 * `NoteOptionsSheet` (Edit / Delete / metadata) via the parent's
 * `onOpenOptions(sourceIndex)` callback.
 *
 * Pending (optimistic) notes show a spinner instead of the options
 * button, matching canonical behaviour.
 */
import { ActivityIndicator, Text, View } from 'react-native';

import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { NoteOptionsKebab } from '@/components/notes/NoteOptionsKebab';
import { colors } from '@/lib/design-tokens/colors';
import type { NoteEntry } from '@/lib/notes/note-entry';

export interface TextNoteCardProps {
  entry: NoteEntry;
  sourceIndex: number;
  authorName?: string;
  readOnly?: boolean;
  /** Parent-supplied: opens the shared NoteOptionsSheet. When omitted
   *  (or the entry is pending / readOnly) the kebab is hidden. */
  onOpenOptions?: (sourceIndex: number) => void;
}

export function TextNoteCard({
  entry,
  sourceIndex,
  authorName,
  readOnly,
  onOpenOptions,
}: TextNoteCardProps) {
  const canManage = !entry.isPending && !readOnly && Boolean(onOpenOptions);

  return (
    <View
      className="rounded-lg border border-border bg-card p-3 gap-1.5"
      testID={`note-row-${sourceIndex}`}
    >
      <NoteCardHeader
        authorName={authorName}
        capturedAt={entry.addedAt}
        testIDSuffix={sourceIndex}
      />
      <View className="flex-row items-start gap-2">
        <Text className="flex-1 text-base text-foreground" selectable>
          {entry.text}
        </Text>
        {canManage ? (
          <NoteOptionsKebab
            noteId={sourceIndex}
            onPress={() => onOpenOptions?.(sourceIndex)}
          />
        ) : entry.isPending ? (
          <View
            className="h-7 w-7 items-center justify-center"
            testID={`text-note-pending-${sourceIndex}`}
          >
            <ActivityIndicator size="small" color={colors.muted.foreground} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
