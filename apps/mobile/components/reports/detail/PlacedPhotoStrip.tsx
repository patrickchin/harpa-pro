/**
 * PlacedPhotoStrip — compact inline grid of thumbnails rendered
 * underneath an issue or summary section when one or more photo
 * groups are placed there.
 *
 * Visually identical to a single batch in `ReportPhotos` but without
 * the surrounding Card / SectionHeader chrome, since the parent card
 * already provides those.
 *
 * Tapping a thumbnail calls `onOpenPhoto` with the file id so the
 * parent screen can open the same swipeable preview modal it uses
 * for the bottom photo strip.
 */
import { useCallback, useState } from 'react';
import { View, Pressable, Text, type LayoutChangeEvent } from 'react-native';
import { MapPin } from 'lucide-react-native';

import { PhotoTile } from '@/components/notes/PhotoTile';
import { attachmentFromSavedFile } from '@/lib/notes/attachments';
import { colors } from '@/lib/design-tokens/colors';
import type { PhotoGroup } from '@/lib/reports/photo-placements';

const COLUMNS = 4;
const GAP = 4;

export interface PlacedPhotoStripProps {
  groups: ReadonlyArray<PhotoGroup>;
  onOpenPhoto?: (input: { fileId: string; title?: string }) => void;
  /** Tapped to re-open the placement sheet for this group (one entry-point per group). */
  onEditPlacement?: (noteId: string) => void;
  testID?: string;
}

export function PlacedPhotoStrip({
  groups,
  onOpenPhoto,
  onEditPlacement,
  testID,
}: PlacedPhotoStripProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width),
    [],
  );
  if (groups.length === 0) return null;

  const tileSize = Math.max(
    0,
    Math.floor((containerWidth - GAP * (COLUMNS - 1)) / COLUMNS),
  );

  return (
    <View className="mt-3 gap-2" testID={testID} onLayout={onLayout}>
      {containerWidth > 0 &&
        groups.map((group) => (
          <View key={group.noteId} testID={`placed-batch-${group.noteId}`}>
            <View className="flex-row flex-wrap" style={{ gap: GAP }}>
              {group.photos.map((p, idx) => {
                return (
                  <View
                    key={p.id}
                    style={{ width: tileSize, height: tileSize }}
                  >
                    <PhotoTile
                      attachment={attachmentFromSavedFile(
                        {
                          id: p.id,
                          fileId: p.fileId,
                          thumbnailFileId: p.thumbnailFileId ?? null,
                        },
                        idx,
                      )}
                      size={tileSize}
                      onPress={
                        onOpenPhoto
                          ? () => onOpenPhoto({ fileId: p.fileId, title: group.title })
                          : undefined
                      }
                      testID={`btn-placed-photo-${p.id}`}
                    />
                  </View>
                );
              })}
            </View>
            {onEditPlacement ? (
              <Pressable
                onPress={() => onEditPlacement(group.noteId)}
                className="mt-2 self-start flex-row items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3.5 py-2"
                accessibilityRole="button"
                accessibilityLabel="Change placement"
                testID={`btn-move-placed-photo-${group.noteId}`}
                hitSlop={10}
                style={{ minHeight: 40 }}
              >
                <MapPin size={16} color={colors.primary.DEFAULT} />
                <Text className="text-sm font-semibold text-primary">
                  Change placement
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))}
    </View>
  );
}
