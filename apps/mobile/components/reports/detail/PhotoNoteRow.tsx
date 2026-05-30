/**
 * `PhotoNoteRow` — read-only photo card rendered in the saved-report
 * Notes tab (one per `report_notes.kind === 'photo'` row).
 *
 * Renders a compact card with a small left-aligned square thumbnail
 * (via `PhotoTile`, sourced from `thumbnailFileId` when present)
 * plus the optional caption. Tap → fullscreen preview.
 */
import { Text, View } from 'react-native';

import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { NoteOptionsKebab } from '@/components/notes/NoteOptionsKebab';
import { PhotoTile } from '@/components/notes/PhotoTile';
import { attachmentFromSavedFile } from '@/lib/notes/attachments';

export interface PhotoNoteRowProps {
  noteId: string;
  fileId: string;
  thumbnailFileId?: string | null;
  body: string | null;
  authorName?: string | null;
  capturedAt: string | null;
  /** Opens the fullscreen preview modal. */
  onOpen?: (input: { fileId: string; title?: string }) => void;
  /** Opens the shared note-options sheet for this row. */
  onOpenOptions?: (noteId: string) => void;
}

export function PhotoNoteRow({
  noteId,
  fileId,
  thumbnailFileId,
  body,
  authorName,
  capturedAt,
  onOpen,
  onOpenOptions,
}: PhotoNoteRowProps) {
  const title = body?.trim() || 'Photo';

  return (
    <View
      className="rounded-lg border border-border bg-card p-3 gap-2"
      testID={`report-note-${noteId}`}
    >
      <NoteCardHeader
        authorName={authorName ?? null}
        capturedAt={capturedAt}
        testIDSuffix={noteId}
        trailing={
          onOpenOptions ? (
            <NoteOptionsKebab
              noteId={noteId}
              onPress={() => onOpenOptions(noteId)}
            />
          ) : null
        }
      />

      <View className="flex-row items-start gap-3">
        <PhotoTile
          attachment={attachmentFromSavedFile({
            id: fileId,
            fileId,
            thumbnailFileId: thumbnailFileId ?? null,
          })}
          size={110}
          onPress={() => onOpen?.({ fileId, title })}
          testID={`btn-open-photo-${noteId}`}
        />
        {body ? (
          <Text className="flex-1 text-sm leading-5 text-foreground">
            {body}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
