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
 * Photos are grouped by note: each image note's `files[]` array
 * forms one batch group, separated by a thin divider. The first
 * tile of a multi-photo batch shows a small "+N" stack badge to
 * signal additional images in the group.
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
  title: string;
  photos: ReadonlyArray<{
    id: string;
    fileId: string;
    thumbnailFileId: string | null;
  }>;
}

const COLUMNS = 3;
const GAP = 6;

export function ReportPhotos({ noteRows, onOpenPhoto }: ReportPhotosProps) {
  const groups = useMemo((): PhotoGroup[] => {
    const out: PhotoGroup[] = [];
    // Newest-first to match `ReportNotesPane`'s timeline order so the
    // photo strip reads in the same direction as the notes above it.
    const sorted = (noteRows ?? [])
      .filter((n) => n.kind === 'photo')
      .slice()
      .sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta;
      });
    for (const n of sorted) {
      const title = n.body?.trim() || 'Photo';
      // Canonical path: per-file rows from `note_files`.
      if (n.files && n.files.length > 0) {
        const photos = n.files
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((f) => ({
            id: f.id,
            fileId: f.fileId,
            thumbnailFileId: f.thumbnailFileId,
          }));
        if (photos.length > 0) {
          out.push({ noteId: n.id, title, photos });
        }
        continue;
      }
      // Legacy single-file fallback for image notes that pre-date
      // `note_files` and never got backfilled.
      if (n.fileId) {
        out.push({
          noteId: n.id,
          title,
          photos: [
            {
              id: n.id,
              fileId: n.fileId,
              thumbnailFileId: n.thumbnailFileId ?? null,
            },
          ],
        });
      }
    }
    return out;
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
        className="mt-3"
        testID="report-photos-grid"
        onLayout={onLayout}
      >
        {containerWidth > 0 &&
          groups.map((group, groupIdx) => (
            <View key={group.noteId}>
              {groupIdx > 0 && (
                <View className="my-2 h-px bg-border" />
              )}
              <View className="flex-row flex-wrap" style={{ gap: GAP }}>
                {group.photos.map((p, idx) => {
                  const isFirstOfBatch = idx === 0 && group.photos.length > 1;
                  return (
                    <View key={p.id} style={{ width: tileSize, height: tileSize }}>
                      <PhotoTile
                        attachment={attachmentFromSavedFile(
                          { id: p.id, fileId: p.fileId, thumbnailFileId: p.thumbnailFileId },
                          idx,
                        )}
                        size={tileSize}
                        onPress={onOpenPhoto ? () => onOpenPhoto({ fileId: p.fileId, title: group.title }) : undefined}
                        testID={`btn-report-photo-${p.id}`}
                      />
                      {isFirstOfBatch && (
                        <StackBadge count={group.photos.length} testID={`stack-badge-${group.noteId}`} />
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
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
