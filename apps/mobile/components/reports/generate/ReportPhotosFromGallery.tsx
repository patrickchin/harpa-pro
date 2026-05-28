/**
 * `ReportPhotosFromGallery` — inline photo strip rendered at the bottom
 * of the Report tab on the Generate-Report screen.
 *
 * Companion to the saved-report `ReportPhotos` component, but driven
 * by the gallery already computed by `GenerateReportProvider` (so
 * thumbnails and the fullscreen swipeable preview share the same
 * source of truth). Each thumbnail resolves through
 * `useFileSignedUrl` + `CachedImage` and taps open the gallery via
 * `preview.openPhoto(fileId)`.
 *
 * Renders nothing when there are no photo notes yet.
 */
import { Pressable, Text, View } from 'react-native';
import { Camera } from 'lucide-react-native';

import { Card } from '@/components/primitives/Card';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { CachedImage } from '@/components/ui/CachedImage';
import { useFileSignedUrl } from '@/lib/uploads/useFileSignedUrl';
import { colors } from '@/lib/design-tokens/colors';

interface GalleryPhoto {
  fileId: string;
  thumbnailFileId: string | null;
  title: string;
  cacheKey: string;
}

interface ReportPhotosFromGalleryProps {
  photos: ReadonlyArray<GalleryPhoto>;
  onOpen: (fileId: string) => void;
}

export function ReportPhotosFromGallery({
  photos,
  onOpen,
}: ReportPhotosFromGalleryProps) {
  if (photos.length === 0) return null;
  return (
    <Card variant="default" padding="lg" testID="generate-report-photos">
      <SectionHeader
        title="Photos"
        icon={<Camera size={16} color={colors.foreground} />}
      />
      <View className="mt-3 gap-2">
        {photos.map((p) => (
          <GalleryPhotoRow key={p.fileId} photo={p} onOpen={onOpen} />
        ))}
      </View>
    </Card>
  );
}

function GalleryPhotoRow({
  photo,
  onOpen,
}: {
  photo: GalleryPhoto;
  onOpen: (fileId: string) => void;
}) {
  const { data } = useFileSignedUrl(photo.fileId);
  const uri = (data as { url?: string } | undefined)?.url ?? null;
  return (
    <Pressable
      onPress={() => onOpen(photo.fileId)}
      accessibilityLabel={`Open photo ${photo.title}`}
      testID={`btn-generate-report-photo-${photo.fileId}`}
      className="rounded-md overflow-hidden bg-muted"
    >
      {uri ? (
        <CachedImage
          source={{ uri }}
          cacheKey={photo.cacheKey}
          style={{ width: '100%', aspectRatio: 4 / 3 }}
          contentFit="cover"
          accessibilityLabel={photo.title}
          testID={`img-generate-report-photo-${photo.fileId}`}
        />
      ) : (
        <View
          className="w-full items-center justify-center bg-muted"
          style={{ aspectRatio: 4 / 3 }}
          testID={`img-generate-report-photo-${photo.fileId}-empty`}
        >
          <Camera size={24} color={colors.muted.foreground} />
        </View>
      )}
      {photo.title && photo.title !== 'Photo' ? (
        <Text className="p-2 text-xs text-muted-foreground" numberOfLines={2}>
          {photo.title}
        </Text>
      ) : null}
    </Pressable>
  );
}
