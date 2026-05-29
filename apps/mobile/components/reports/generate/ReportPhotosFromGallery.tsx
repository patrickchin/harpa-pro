/**
 * `ReportPhotosFromGallery` — 3-column photo grid rendered at the
 * bottom of the Report tab on the Generate-Report screen.
 *
 * Photos are grouped by `noteId` so each batch-upload note appears as
 * its own grid section, matching the notes-timeline layout. Each
 * thumbnail resolves through `useFileSignedUrl` + `CachedImage` via
 * `PhotoTile`, and taps open the fullscreen gallery.
 *
 * Renders nothing when there are no photo notes yet.
 */
import { useCallback, useMemo, useState } from 'react';
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
  noteId: string;
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
  const groups = useMemo(() => {
    const groupMap = new Map<string, GalleryPhoto[]>();
    for (const p of photos) {
      const group = groupMap.get(p.noteId);
      if (group) group.push(p);
      else groupMap.set(p.noteId, [p]);
    }
    return Array.from(groupMap.values());
  }, [photos]);

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
      <View className="mt-3 gap-3" onLayout={onLayout}>
        {containerWidth > 0 &&
          groups.map((batch) => {
            const first = batch[0];
            if (!first) return null;
            return (
              <View
                key={first.noteId}
                className="flex-row flex-wrap"
                style={{ gap: GAP }}
                testID={`generate-report-photos-batch-${first.noteId}`}
              >
                {batch.map((p, idx) => (
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
            );
          })}
      </View>
    </Card>
  );
}
