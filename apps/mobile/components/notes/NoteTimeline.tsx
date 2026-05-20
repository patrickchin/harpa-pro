/**
 * NoteTimeline — chronological list of notes captured for a report.
 *
 * P3.6 ported text-only rendering; Phase E (voice pipeline) adds
 * `VoiceNoteCard` dispatch for `source === 'voice'` rows (covers
 * in-flight, failed, and saved voice notes). Photo + pending-upload
 * rows are still deferred to P4.
 *
 * Per-row delete + edit affordances live on `TextNoteCard`. Delete
 * triggers `onRemoveNote(sourceIndex)` which the provider routes
 * through its global delete-confirm dialog; edit calls `onEditNote`
 * synchronously with the trimmed new body once the user confirms.
 * Voice rows surface a `Retry` button on the `failed` state which
 * routes through `onRetryVoice(sourceIndex)`.
 */
import { Text, View } from 'react-native';

import { TextNoteCard } from '@/components/notes/TextNoteCard';
import { VoiceNoteCard } from '@/features/voice/VoiceNoteCard';
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
  /** Retry handler for failed voice notes. */
  onRetryVoice?: (sourceIndex: number) => void;
}

export function NoteTimeline({
  notes,
  isLoading,
  error,
  memberNames,
  onRemoveNote,
  onEditNote,
  onRetryVoice,
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
        if (entry.source === 'voice') {
          return (
            <VoiceNoteCard
              key={entry.id ?? `note-${index}`}
              entry={entry}
              sourceIndex={index}
              authorName={authorName}
              onRetry={onRetryVoice}
            />
          );
        }
        const isImage = entry.source === 'image';
        return (
          <TextNoteCard
            key={entry.id ?? `note-${index}`}
            entry={entry}
            sourceIndex={index}
            authorName={authorName}
            onRemove={isImage ? undefined : onRemoveNote}
            onEdit={isImage ? undefined : onEditNote}
          />
        );
      })}
    </View>
  );
}

