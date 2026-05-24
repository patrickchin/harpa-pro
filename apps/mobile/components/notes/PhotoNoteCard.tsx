/**
 * PhotoNoteCard — one photo note row in the Generate-screen timeline.
 *
 * Renders chronologically in the mixed text/voice/photo timeline as
 * a compact card: a small left-aligned square thumbnail (via
 * `PhotoGridTile`, fetched from `thumbnailFileId` when present) plus
 * an optional caption next to it. Tap the tile → `onOpen(fileId, sourceIndex)`
 * opens the fullscreen swipeable gallery wired through
 * `GenerateReportProvider`.
 */
import { Text, View } from 'react-native';

import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { PhotoGridTile } from '@/components/notes/PhotoGridTile';
import type { NoteEntry } from '@/lib/note-entry';

export interface PhotoNoteCardProps {
  entry: NoteEntry;
  sourceIndex: number;
  authorName?: string;
  /** Opens the fullscreen swipeable gallery focussed on this photo. */
  onOpen?: (fileId: string, sourceIndex: number) => void;
}

export function PhotoNoteCard({
  entry,
  sourceIndex,
  authorName,
  onOpen,
}: PhotoNoteCardProps) {
  const fileId = entry.fileId ?? null;
  const body = entry.text?.trim() ?? '';
  const title = body || 'Photo';

  return (
    <View
      className="rounded-lg border border-border bg-card p-3 gap-2"
      testID={`note-row-${sourceIndex}`}
    >
      <NoteCardHeader
        authorName={authorName}
        capturedAt={entry.addedAt}
        testIDSuffix={sourceIndex}
      />

      <View className="flex-row items-start gap-3">
        <PhotoGridTile
          fileId={fileId}
          thumbnailFileId={entry.thumbnailFileId ?? null}
          size={110}
          onPress={fileId && onOpen ? () => onOpen(fileId, sourceIndex) : undefined}
          accessibilityLabel={`Open photo ${title}`}
          testID={`btn-open-photo-${sourceIndex}`}
        />
        {body ? (
          <Text
            className="flex-1 text-sm leading-5 text-foreground"
            selectable
          >
            {body}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
