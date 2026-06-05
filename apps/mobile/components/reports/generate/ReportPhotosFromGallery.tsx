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
import { PhotoPlacementChip } from '@/components/reports/detail/PhotoPlacementChip';
import { attachmentFromSavedFile } from '@/lib/notes/attachments';
import { colors } from '@/lib/design-tokens/colors';
import { placementLabel, type PhotoPlacement } from '@/lib/reports/photo-placements';
import type { GeneratedSiteReport } from '@harpa/report-core';

interface GalleryPhoto {
  fileId: string;
  thumbnailFileId: string | null;
  noteId: string;
  title: string;
  cacheKey: string;
  placement?: PhotoPlacement | null;
}

interface ReportPhotosFromGalleryProps {
  photos: ReadonlyArray<GalleryPhoto>;
  onOpen: (fileId: string) => void;
  /**
   * When provided, each photo group renders a placement chip — tapping
   * it calls this handler with the group's `noteId` so the parent can
   * mount `PhotoGroupPlacementSheet`. Omit to hide the chip entirely
   * (legacy "stuck at the bottom" rendering).
   */
  onOpenPlacementSheet?: (noteId: string) => void;
  /**
   * Live report used to resolve a placement's index → display label.
   * Required when `onOpenPlacementSheet` is set so placed groups can
   * show "Placed in: <issue title>" instead of a raw index.
   */
  report?: GeneratedSiteReport | null;
}

const COLUMNS = 3;
const GAP = 6;

export function ReportPhotosFromGallery({
  photos,
  onOpen,
  onOpenPlacementSheet,
  report = null,
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
        title={onOpenPlacementSheet ? 'Unplaced photos' : 'Photos'}
        icon={<Camera size={16} color={colors.foreground} />}
      />
      <View className="mt-3" onLayout={onLayout}>
        {containerWidth > 0 &&
          groups.map((batch, batchIdx) => {
            const first = batch[0];
            if (!first) return null;
            const placement = first.placement ?? null;
            const label = placementLabel(placement, report);
            return (
              <View key={first.noteId}>
                {batchIdx > 0 && (
                  <View className="my-2 h-px bg-border" />
                )}
                {onOpenPlacementSheet ? (
                  <View className="mb-2">
                    <PhotoPlacementChip
                      placedLabel={label}
                      onPress={() => onOpenPlacementSheet(first.noteId)}
                      testID={`btn-generate-report-photos-place-${first.noteId}`}
                    />
                  </View>
                ) : null}
                <View
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
              </View>
            );
          })}
      </View>
    </Card>
  );
}
