/**
 * PhotoNoteCard — one photo note row in the Generate-screen timeline.
 *
 * Sourced from the saved-report `PhotoNoteRow` but indexed by
 * `sourceIndex` (matching `TextNoteCard` / `VoiceNoteCard`) so the
 * draft-side `NoteTimeline` can dispatch by entry kind without
 * caring about the persistent note id.
 *
 * Tap the thumbnail → `onOpen(fileId, sourceIndex)` opens the
 * fullscreen swipeable gallery wired through `GenerateReportProvider`.
 */
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Camera } from 'lucide-react-native';

import { CachedImage } from '@/components/ui/CachedImage';
import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { useFileSignedUrl } from '@/lib/uploads/useFileSignedUrl';
import { colors } from '@/lib/design-tokens/colors';
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
  const { data, isLoading } = useFileSignedUrl(fileId ?? undefined);
  const uri = (data as { url?: string } | undefined)?.url ?? null;
  const body = entry.text?.trim() ?? '';
  const title = body || 'Photo';
  const pending = entry.isPending || !fileId;

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

      <Pressable
        onPress={() => {
          if (!fileId || !onOpen) return;
          onOpen(fileId, sourceIndex);
        }}
        disabled={!fileId || !onOpen}
        accessibilityLabel={`Open photo ${title}`}
        testID={`btn-open-photo-${sourceIndex}`}
        className="rounded-md overflow-hidden bg-muted"
      >
        {uri ? (
          <CachedImage
            source={{ uri }}
            cacheKey={fileId ?? undefined}
            style={{ width: '100%', aspectRatio: 4 / 3 }}
            contentFit="cover"
            accessibilityLabel={title}
            testID={`img-photo-${sourceIndex}`}
          />
        ) : (
          <View
            className="w-full items-center justify-center bg-muted"
            style={{ aspectRatio: 4 / 3 }}
            testID={
              pending
                ? `img-photo-${sourceIndex}-pending`
                : isLoading
                  ? `img-photo-${sourceIndex}-loading`
                  : `img-photo-${sourceIndex}-empty`
            }
          >
            {pending || isLoading ? (
              <ActivityIndicator size="small" color={colors.muted.foreground} />
            ) : (
              <Camera size={24} color={colors.muted.foreground} />
            )}
          </View>
        )}
      </Pressable>

      {body ? (
        <Text className="text-sm leading-5 text-foreground" selectable>
          {body}
        </Text>
      ) : null}
    </View>
  );
}
