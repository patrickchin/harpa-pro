/**
 * `ImageNoteCard` — timeline row for `kind: 'image'` notes.
 *
 * Resolves a signed GET URL via `useFileSignedUrl(fileId)` and renders
 * the thumbnail through `CachedImage` (= expo-image + disk cache). Tap
 * opens the full-screen `ImagePreviewModal`. While the URL is loading
 * we show a skeleton; on failure we render an inline retry.
 *
 * Pitfall 8 contract: `kind: 'image'` notes carry only a `fileId` from
 * the API — never an inline URL. The signed-URL hook is the only path
 * for resolving R2-backed bytes (Pitfall 13: no DI stub; the route
 * itself is exercised end-to-end via `useFileUrlQuery`).
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { RotateCw } from 'lucide-react-native';

import { CachedImage } from '@/components/ui/CachedImage';
import { ImagePreviewModal } from '@/components/files/ImagePreviewModal';
import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { useFileSignedUrl } from '@/lib/uploads/useFileSignedUrl';
import { colors } from '@/lib/design-tokens/colors';
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
  const { data, isLoading, isError, refetch } = useFileSignedUrl(fileId);
  const url = (data as { url?: string } | undefined)?.url ?? null;

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
        {url ? (
          <Pressable
            onPress={() => setPreviewOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open photo"
            testID={`btn-image-note-open-${sourceIndex}`}
          >
            <CachedImage
              source={{ uri: url }}
              cacheKey={fileId ?? undefined}
              style={{ width: '100%', height: 200, borderRadius: 8 }}
              contentFit="cover"
              testID={`img-image-note-${sourceIndex}`}
              accessibilityLabel="Photo"
            />
          </Pressable>
        ) : isError ? (
          <View
            className="h-[200px] items-center justify-center rounded-md bg-muted gap-2"
            testID={`image-note-error-${sourceIndex}`}
          >
            <Text className="text-sm text-danger-foreground" selectable>
              Could not load image.
            </Text>
            <Pressable
              onPress={() => {
                void refetch();
              }}
              accessibilityRole="button"
              accessibilityLabel="Retry loading image"
              testID={`btn-image-note-retry-${sourceIndex}`}
              className="flex-row items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5"
            >
              <RotateCw size={14} color={colors.muted.foreground} />
              <Text className="text-sm text-foreground">Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View
            className="h-[200px] items-center justify-center rounded-md bg-muted"
            testID={`image-note-skeleton-${sourceIndex}`}
          >
            <ActivityIndicator
              size="small"
              color={colors.muted.foreground}
              accessibilityLabel={isLoading ? 'Loading image' : 'Image pending'}
            />
          </View>
        )}
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
