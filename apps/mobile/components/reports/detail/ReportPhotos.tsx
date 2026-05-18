/**
 * `ReportPhotos` — inline photo strip rendered at the bottom of the
 * Report tab on a saved report. Image-only counterpart to the Notes
 * timeline; voice + documents stay in the Notes tab.
 *
 * Ported from
 * `../haru3-reports/apps/mobile/components/reports/ReportPhotos.tsx`
 * (branch `dev`). v4 data model: filters `noteRows` to `kind === 'photo'`
 * (the API returns `image` kind from R2 — already remapped to `photo`
 * inside the route mapping in `[number]/index.tsx`). Each photo renders
 * through `useFileSignedUrl` + `CachedImage` and opens the
 * fullscreen preview on tap.
 */
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Camera } from 'lucide-react-native';

import { Card } from '@/components/primitives/Card';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { CachedImage } from '@/components/ui/CachedImage';
import { useFileSignedUrl } from '@/lib/uploads/useFileSignedUrl';
import { colors } from '@/lib/design-tokens/colors';
import type { ReportNoteRow } from '@/components/reports/detail/ReportNotesPane';

export interface ReportPhotosProps {
  noteRows: ReadonlyArray<ReportNoteRow> | undefined;
  onOpenPhoto?: (input: { fileId: string; title?: string }) => void;
}

export function ReportPhotos({ noteRows, onOpenPhoto }: ReportPhotosProps) {
  const photos = useMemo(
    () =>
      (noteRows ?? []).filter(
        (n): n is ReportNoteRow & { fileId: string } =>
          n.kind === 'photo' && typeof n.fileId === 'string' && !!n.fileId,
      ),
    [noteRows],
  );

  if (photos.length === 0) return null;

  return (
    <Card variant="default" padding="lg" testID="report-photos">
      <SectionHeader
        title="Photos"
        icon={<Camera size={16} color={colors.foreground} />}
      />
      <View className="mt-3 gap-2">
        {photos.map((p) => (
          <ReportPhotoItem
            key={p.id}
            photo={p}
            onOpen={onOpenPhoto}
          />
        ))}
      </View>
    </Card>
  );
}

function ReportPhotoItem({
  photo,
  onOpen,
}: {
  photo: ReportNoteRow & { fileId: string };
  onOpen?: (input: { fileId: string; title?: string }) => void;
}) {
  const { data } = useFileSignedUrl(photo.fileId);
  const uri = (data as { url?: string } | undefined)?.url ?? null;
  const title = photo.body?.trim() || 'Photo';
  return (
    <Pressable
      onPress={() => onOpen?.({ fileId: photo.fileId, title })}
      accessibilityLabel={`Open photo ${title}`}
      testID={`btn-report-photo-${photo.id}`}
      className="rounded-md overflow-hidden bg-muted"
    >
      {uri ? (
        <CachedImage
          source={{ uri }}
          cacheKey={photo.fileId}
          style={{ width: '100%', aspectRatio: 4 / 3 }}
          contentFit="cover"
          accessibilityLabel={title}
          testID={`img-report-photo-${photo.id}`}
        />
      ) : (
        <View
          className="w-full items-center justify-center bg-muted"
          style={{ aspectRatio: 4 / 3 }}
          testID={`img-report-photo-${photo.id}-empty`}
        >
          <Camera size={24} color={colors.muted.foreground} />
        </View>
      )}
      {photo.body ? (
        <Text className="p-2 text-xs text-muted-foreground" numberOfLines={2}>
          {photo.body}
        </Text>
      ) : null}
    </Pressable>
  );
}
