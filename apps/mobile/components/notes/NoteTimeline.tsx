/**
 * NoteTimeline — chronological list of notes captured for a report.
 *
 * P3.6 scope: text notes only. Voice + photo + pending-upload rows are
 * deferred to P3.7/P3.8 (the upload pipelines they depend on are not
 * yet ported). The canonical surface
 * (`../haru3-reports/apps/mobile/components/notes/NoteTimeline.tsx`)
 * also handles file rows, pending photos, and pending voice cards —
 * those branches will be re-added when the pipeline hooks land.
 */
import { Text, View } from 'react-native';

import type { NoteEntry } from '@/lib/note-entry';

export interface NoteTimelineProps {
  notes: readonly NoteEntry[];
  isLoading?: boolean;
  error?: Error | null;
  memberNames?: ReadonlyMap<string, string>;
  /** Optional remove handler — wired in P3.7 once persistence lands. */
  onRemoveNote?: (sourceIndex: number) => void;
}

export function NoteTimeline({
  notes,
  isLoading,
  error,
  memberNames,
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
      {notes.map((entry, index) => (
        <View
          key={entry.id ?? `note-${index}`}
          className="rounded-lg border border-border bg-card p-3"
          testID={`note-row-${index}`}
        >
          <Text className="text-base text-foreground" selectable>
            {entry.text}
          </Text>
          {entry.authorId ? (
            <Text className="mt-1 text-xs text-muted-foreground">
              {memberNames?.get(entry.authorId) ?? entry.authorId}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
