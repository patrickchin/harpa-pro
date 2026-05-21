/**
 * NoteCardHeader — shared author + captured-at row rendered at the top
 * of every report note card (text, voice, photo). Lives in one place
 * so all note-card surfaces look consistent.
 *
 * Mirrors the canonical text-note header layout from
 * `../haru3-reports/apps/mobile/components/notes/TextNoteCard.tsx` so
 * voice / photo cards can reuse the same row when they port.
 */
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { formatCapturedAt } from '@/lib/date';

export interface NoteCardHeaderProps {
  /** Resolved display name (e.g. memberNames.get(authorId)). */
  authorName?: string | null;
  /** ISO-8601 string, epoch ms, or Date — formatted via formatCapturedAt. */
  capturedAt?: string | number | Date | null;
  /** Suffix appended to testIDs so multiple cards stay distinguishable. */
  testIDSuffix?: string | number;
  /**
   * Optional element rendered to the right of the captured-at
   * timestamp. Used by voice cards for the ⋯ transcript kebab so the
   * trigger sits in a consistent top-right corner across all note
   * surfaces without each card duplicating layout.
   */
  trailing?: ReactNode;
}

export function NoteCardHeader({
  authorName,
  capturedAt,
  testIDSuffix,
  trailing,
}: NoteCardHeaderProps) {
  const capturedDisplay = formatCapturedAt(capturedAt);
  const author = authorName?.trim() || 'Unknown';
  if (!capturedDisplay && !authorName?.trim() && !trailing) return null;

  return (
    <View className="flex-row items-center justify-between gap-2">
      <Text
        className="flex-1 text-[10px] font-medium text-muted-foreground"
        numberOfLines={1}
        testID={
          testIDSuffix !== undefined
            ? `note-card-author-${testIDSuffix}`
            : 'note-card-author'
        }
      >
        {author}
      </Text>
      {capturedDisplay ? (
        <Text
          className="text-[10px] text-muted-foreground"
          numberOfLines={1}
          testID={
            testIDSuffix !== undefined
              ? `note-card-captured-at-${testIDSuffix}`
              : 'note-card-captured-at'
          }
        >
          {capturedDisplay}
        </Text>
      ) : null}
      {trailing ?? null}
    </View>
  );
}
