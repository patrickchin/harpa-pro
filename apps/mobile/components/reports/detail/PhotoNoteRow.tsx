/**
 * `PhotoNoteRow` — read-only photo card rendered in the saved-report
 * Notes tab (one per `report_notes.kind === 'photo'` row).
 *
 * Adapted from the canonical voice/photo cards in
 * `../haru3-reports/apps/mobile/components/notes/NoteTimeline.tsx` +
 * `components/files/FileCard.tsx` (branch `dev`). The v4 data model
 * is narrower (no `file_metadata.width`/`height`/`blurhash`) so the
 * card renders a fixed-aspect thumbnail via `CachedImage` backed by a
 * short-lived signed GET URL.
 */
import { Pressable, Text, View } from 'react-native';
import { Camera } from 'lucide-react-native';

import { CachedImage } from '@/components/ui/CachedImage';
import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { NoteOptionsKebab } from '@/components/reports/detail/NoteOptionsKebab';
import { useFileSignedUrl } from '@/lib/uploads/useFileSignedUrl';
import { colors } from '@/lib/design-tokens/colors';

export interface PhotoNoteRowProps {
  noteId: string;
  fileId: string;
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
  body,
  authorName,
  capturedAt,
  onOpen,
  onOpenOptions,
}: PhotoNoteRowProps) {
  const { data, isLoading } = useFileSignedUrl(fileId);
  const uri = (data as { url?: string } | undefined)?.url ?? null;
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

      <Pressable
        onPress={() => onOpen?.({ fileId, title })}
        accessibilityLabel={`Open photo ${title}`}
        testID={`btn-open-photo-${noteId}`}
        className="rounded-md overflow-hidden bg-muted"
      >
        {uri ? (
          <CachedImage
            source={{ uri }}
            cacheKey={fileId}
            style={{ width: '100%', aspectRatio: 4 / 3 }}
            contentFit="cover"
            accessibilityLabel={title}
            testID={`img-photo-${noteId}`}
          />
        ) : (
          <View
            className="w-full items-center justify-center bg-muted"
            style={{ aspectRatio: 4 / 3 }}
            testID={
              isLoading
                ? `img-photo-${noteId}-loading`
                : `img-photo-${noteId}-empty`
            }
          >
            <Camera size={24} color={colors.muted.foreground} />
          </View>
        )}
      </Pressable>

      {body ? (
        <Text className="text-sm leading-5 text-foreground">{body}</Text>
      ) : null}
    </View>
  );
}
