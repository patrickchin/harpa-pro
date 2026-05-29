/**
 * `ReportPhotos` — inline photo strip rendered at the bottom of the
 * Report tab on a saved report. Image-only counterpart to the Notes
 * timeline; voice + documents stay in the Notes tab.
 *
 * Renders a 3-column Instagram-style grid of square thumbnails. Each
 * tile pulls the small client-generated thumbnail (`thumbnailFileId`)
 * when present, falling back to the full image for legacy notes. Tap
 * a tile to open the fullscreen swipeable gallery.
 *
 * Photos are grouped by `noteId` so batch uploads appear together.
 * The first tile of a multi-photo batch shows a small "+N" stack
 * badge to signal additional images in the group.
 */
import { useCallback, useMemo, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { Camera } from 'lucide-react-native';

import { Card } from '@/components/primitives/Card';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { PhotoTile } from '@/components/notes/PhotoTile';
import { attachmentFromSavedFile } from '@/lib/notes/attachments';
import { colors } from '@/lib/design-tokens/colors';
import type { ReportNoteRow } from '@/components/reports/detail/ReportNotesPane';

export interface ReportPhotosProps {
  noteRows: ReadonlyArray<ReportNoteRow> | undefined;
  onOpenPhoto?: (input: { fileId: string; title?: string }) => void;
}

interface PhotoGroup {
  noteId: string;
  photos: Array<ReportNoteRow & { fileId: string }>;
}

const COLUMNS = 3;
const GAP = 6;

export function ReportPhotos({ noteRows, onOpenPhoto }: ReportPhotosProps) {
  const groups = useMemo((): PhotoGroup[] => {
    const photos = (noteRows ?? []).filter(
      (n): n is ReportNoteRow & { fileId: string } =>
        n.kind === 'photo' && typeof n.fileId === 'string' && !!n.fileId,
    );

    // Group by noteId (batch key). Falls back to the row's own id for
    // legacy single-file notes so they each form their own group.
    const groupMap = new Map<string, Array<(typeof photos)[number]>>();
    for (const p of photos) {
      const key = p.noteId ?? p.id;
      const group = groupMap.get(key);
      if (group) group.push(p);
      else groupMap.set(key, [p]);
    }

    return Array.from(groupMap.entries()).map(([noteId, items]) => ({
      noteId,
      photos: items,
    }));
  }, [noteRows]);

  const [containerWidth, setContainerWidth] = useState(0);
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width),
    [],
  );

  const tileSize = Math.max(
    0,
    Math.floor((containerWidth - GAP * (COLUMNS - 1)) / COLUMNS),
  );

  const totalPhotos = groups.reduce((sum, g) => sum + g.photos.length, 0);
  if (totalPhotos === 0) return null;

  return (
    <Card variant="default" padding="lg" testID="report-photos">
      <SectionHeader
        title="Photos"
        icon={<Camera size={16} color={colors.foreground} />}
      />
      <View
        className="mt-3 flex-row flex-wrap"
        style={{ gap: GAP }}
        testID="report-photos-grid"
        onLayout={onLayout}
      >
        {containerWidth > 0 &&
          groups.flatMap((group) =>
            group.photos.map((p, idx) => {
              const title = p.body?.trim() || 'Photo';
              const isFirstOfBatch = idx === 0 && group.photos.length > 1;
              return (
                <View key={p.id} style={{ width: tileSize, height: tileSize }}>
                  <PhotoTile
                    attachment={attachmentFromSavedFile(
                      { id: p.id, fileId: p.fileId, thumbnailFileId: p.thumbnailFileId ?? null },
                      idx,
                    )}
                    size={tileSize}
                    onPress={(p.fileId && onOpenPhoto) ? () => onOpenPhoto({ fileId: p.fileId, title }) : undefined}
                    testID={`btn-report-photo-${p.id}`}
                  />
                  {isFirstOfBatch && (
                    <StackBadge count={group.photos.length} testID={`stack-badge-${group.noteId}`} />
                  )}
                </View>
              );
            }),
          )}
      </View>
    </Card>
  );
}

/** Small count indicator overlaid on the first tile of a batch group. */
function StackBadge({ count, testID }: { count: number; testID?: string }) {
  return (
    <View
      className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5"
      testID={testID}
    >
      <Text className="text-[10px] font-semibold leading-3 text-white">
        +{count - 1}
      </Text>
    </View>
  );
}
