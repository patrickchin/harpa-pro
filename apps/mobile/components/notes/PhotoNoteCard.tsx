/**
 * PhotoNoteCard — one photo note row in the Generate-screen timeline.
 *
 * Header + a single <PhotoBatchGrid attachments> underneath. The grid
 * renders every state (saved, pending, failed, overflow) via
 * <PhotoTile>; the card has no status text, no helper rows. The
 * card's interior width is measured via onLayout and threaded into
 * the grid so the 3-wide layout never clips on the right edge.
 *
 * `entry.attachments` is the source of truth. While the legacy
 * `files` / `pendingFiles` / `pendingUpload` / `fileId` fields still
 * exist on `NoteEntry` (T1), the card falls back to
 * `buildAttachments(entry)` whenever `entry.attachments` is not
 * provided — kept until T10 removes the legacy fields.
 */
import { useCallback, useMemo, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';

import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { NoteOptionsKebab } from '@/components/notes/NoteOptionsKebab';
import { PhotoBatchGrid } from '@/components/notes/PhotoBatchGrid';
import { buildAttachments } from '@/lib/notes/attachments';
import type { NoteEntry } from '@/lib/notes/note-entry';

export interface PhotoNoteCardProps {
  entry: NoteEntry;
  sourceIndex: number;
  authorName?: string;
  /** Opens the fullscreen swipeable gallery focussed on this photo. */
  onOpen?: (fileId: string, sourceIndex: number) => void;
  /** Opens the shared `NoteOptionsSheet` (delete, metadata). */
  onOpenOptions?: (sourceIndex: number) => void;
  /** Retry a failed upload job (matches `pendingFiles[].jobId`). */
  onRetryUpload?: (jobId: string) => void;
  /** Cancel/dismiss an in-flight or failed upload job. */
  onCancelUpload?: (jobId: string) => void;
}

export function PhotoNoteCard({
  entry,
  sourceIndex,
  authorName,
  onOpen,
  onOpenOptions,
  onRetryUpload,
  onCancelUpload,
}: PhotoNoteCardProps) {
  const body = entry.text?.trim() ?? '';
  const attachments = useMemo(
    () => entry.attachments ?? buildAttachments(entry),
    [entry],
  );
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  const onLayout = useCallback((ev: LayoutChangeEvent) => {
    const w = ev.nativeEvent.layout.width;
    setContainerWidth((prev) => (prev === w ? prev : w));
  }, []);

  const handleOpen = useCallback(
    (fileId: string) => {
      onOpen?.(fileId, sourceIndex);
    },
    [onOpen, sourceIndex],
  );

  return (
    <View
      className="rounded-lg border border-border bg-card p-3 gap-2"
      testID={`note-row-${sourceIndex}`}
    >
      <NoteCardHeader
        authorName={authorName}
        capturedAt={entry.addedAt}
        testIDSuffix={sourceIndex}
        trailing={
          onOpenOptions ? (
            <NoteOptionsKebab
              noteId={sourceIndex}
              onPress={() => onOpenOptions(sourceIndex)}
            />
          ) : null
        }
      />
      <View onLayout={onLayout} testID={`note-row-${sourceIndex}-measure`}>
        {containerWidth !== null && attachments.length > 0 ? (
          <PhotoBatchGrid
            attachments={attachments}
            containerWidth={containerWidth}
            onOpenFile={handleOpen}
            onRetryUpload={onRetryUpload}
            onCancelUpload={onCancelUpload}
          />
        ) : null}
      </View>
      {body ? (
        <Text className="text-sm leading-5 text-foreground" selectable>
          {body}
        </Text>
      ) : null}
    </View>
  );
}
