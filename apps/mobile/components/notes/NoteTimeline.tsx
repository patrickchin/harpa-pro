/**
 * NoteTimeline — chronological list of notes captured for a report.
 *
 * P3.6 scope: text notes only. Voice + photo + pending-upload rows are
 * deferred to P4 (the upload pipelines they depend on are not
 * yet ported). The canonical surface
 * (`../haru3-reports/apps/mobile/components/notes/NoteTimeline.tsx`)
 * also handles file rows, pending photos, and pending voice cards —
 * those branches will be re-added when the pipeline hooks land.
 *
 * Per-row delete + edit affordances live on `TextNoteCard`. Delete
 * triggers `onRemoveNote(sourceIndex)` which the provider routes
 * through its global delete-confirm dialog; edit calls `onEditNote`
 * synchronously with the trimmed new body once the user confirms.
 */
import { Text, View } from 'react-native';

import { TextNoteCard } from '@/components/notes/TextNoteCard';
import type { NoteEntry } from '@/lib/note-entry';

export interface NoteTimelineProps {
  notes: readonly NoteEntry[];
  isLoading?: boolean;
  error?: Error | null;
  memberNames?: ReadonlyMap<string, string>;
  /** Optional remove handler. Provider routes through delete-confirm. */
  onRemoveNote?: (sourceIndex: number) => void;
  /** Optional edit handler. Called with the trimmed new body. */
  onEditNote?: (sourceIndex: number, nextBody: string) => void;
}

export function NoteTimeline({
  notes,
  isLoading,
  error,
  memberNames,
  onRemoveNote,
  onEditNote,
}: NoteTimelineProps) {
  if (isLoading) {
    return (
      <Text className="text-sm text-muted-foreground" testID="note-timeline-loading">
        Loading…
      </Text>
    );
  }

  if (error) {
    return (
      <Text className="text-sm text-danger-foreground" selectable>
        Could not load notes: {error.message}
      </Text>
    );
  }

  if (notes.length === 0) return null;

  return (
    <View className="gap-2" testID="note-timeline">
      {notes.map((entry, index) => {
        const authorName = entry.authorId
          ? memberNames?.get(entry.authorId)
          : undefined;
        return (
          <TextNoteCard
            key={entry.id ?? `note-${index}`}
            entry={entry}
            sourceIndex={index}
            authorName={authorName}
            onRemove={onRemoveNote}
            onEdit={onEditNote}
          />
        );
      })}
    </View>
  );
}

