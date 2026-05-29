/**
 * `ReportPhotosFromGallery` — 3-column photo grid rendered at the
 * bottom of the Report tab on the Generate-Report screen.
 *
 * Companion to the saved-report `ReportPhotos` component, but driven
 * by the gallery already computed by `GenerateReportProvider` (so
 * thumbnails and the fullscreen swipeable preview share the same
 * source of truth). Each thumbnail resolves through
 * `useFileSignedUrl` + `CachedImage` via `PhotoTile`, and taps open
 * the gallery via `preview.openPhoto(fileId)`.
 *
 * Renders nothing when there are no photo notes yet.
 */
import { useCallback, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Camera } from 'lucide-react-native';

import { Card } from '@/components/primitives/Card';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { PhotoTile } from '@/components/notes/PhotoTile';
import { attachmentFromSavedFile } from '@/lib/notes/attachments';
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

const COLUMNS = 3;
const GAP = 6;

export function ReportPhotosFromGallery({
  photos,
  onOpen,
}: ReportPhotosFromGalleryProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width),
    [],
  );

  const tileSize = Math.max(
    0,
    Math.floor((containerWidth - GAP * (COLUMNS - 1)) / COLUMNS),
  );

  if (photos.length === 0) return null;
  return (
    <Card variant="default" padding="lg" testID="generate-report-photos">
      <SectionHeader
        title="Photos"
        icon={<Camera size={16} color={colors.foreground} />}
      />
      <View
        className="mt-3 flex-row flex-wrap"
        style={{ gap: GAP }}
        testID="generate-report-photos-grid"
        onLayout={onLayout}
      >
        {containerWidth > 0 &&
          photos.map((p, idx) => (
            <View key={p.fileId} style={{ width: tileSize, height: tileSize }}>
              <PhotoTile
                attachment={attachmentFromSavedFile(
                  { id: p.fileId, fileId: p.fileId, thumbnailFileId: p.thumbnailFileId },
                  idx,
                )}
                size={tileSize}
                onPress={() => onOpen(p.fileId)}
                testID={`btn-generate-report-photo-${p.fileId}`}
              />
            </View>
          ))}
      </View>
    </Card>
  );
}
