/**
 * `ImageNoteCard` — timeline row for `kind: 'image'` notes.
 *
 * Renders a compact card with a small ~110 px square thumbnail (via
 * `PhotoGridTile`, sourced from `thumbnailFileId` when present, else
 * the full `fileId`). Tap opens the full-screen `ImagePreviewModal`,
 * which still fetches the full `fileId` for sharp viewing. While the
 * URL is loading we show a small skeleton inside the tile.
 *
 * Pitfall 8 contract: `kind: 'image'` notes carry only a `fileId`
 * (and optionally `thumbnailFileId`) from the API — never an inline
 * URL. The signed-URL hook is the only path for resolving R2-backed
 * bytes.
 */
import { useState } from 'react';
import { Text, View } from 'react-native';

import { ImagePreviewModal } from '@/components/files/ImagePreviewModal';
import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { PhotoGridTile } from '@/components/notes/PhotoGridTile';
import type { NoteEntry } from '@/lib/note-entry';

export interface ImageNoteCardProps {
  entry: NoteEntry;
  sourceIndex: number;
  authorName?: string;
}

export function ImageNoteCard({
  entry,
  sourceIndex,
  authorName,
}: ImageNoteCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileId = entry.fileId ?? null;
  const body = entry.text?.trim() ?? '';

  return (
    <>
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
            onPress={fileId ? () => setPreviewOpen(true) : undefined}
            accessibilityLabel="Open photo"
            testID={`btn-image-note-open-${sourceIndex}`}
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

      <ImagePreviewModal
        visible={previewOpen}
        fileId={fileId}
        title="Photo"
        onClose={() => setPreviewOpen(false)}
        cacheKey={fileId}
      />
    </>
  );
}
