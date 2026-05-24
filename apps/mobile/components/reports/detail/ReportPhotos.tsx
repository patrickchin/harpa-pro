/**
 * `ReportPhotos` — inline photo strip rendered at the bottom of the
 * Report tab on a saved report. Image-only counterpart to the Notes
 * timeline; voice + documents stay in the Notes tab.
 *
 * Renders a 3-column Instagram-style grid of square thumbnails. Each
 * tile pulls the small client-generated thumbnail (`thumbnailFileId`)
 * when present, falling back to the full image for legacy notes. Tap
 * a tile to open the fullscreen swipeable gallery.
 */
import { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Camera } from 'lucide-react-native';

import { Card } from '@/components/primitives/Card';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { PhotoGridTile } from '@/components/notes/PhotoGridTile';
import { colors } from '@/lib/design-tokens/colors';
import type { ReportNoteRow } from '@/components/reports/detail/ReportNotesPane';

export interface ReportPhotosProps {
  noteRows: ReadonlyArray<ReportNoteRow> | undefined;
  onOpenPhoto?: (input: { fileId: string; title?: string }) => void;
}

const COLUMNS = 3;
const GAP = 6;
const CARD_PADDING = 16; // matches `Card` padding="lg" lateral inset

export function ReportPhotos({ noteRows, onOpenPhoto }: ReportPhotosProps) {
  const photos = useMemo(
    () =>
      (noteRows ?? []).filter(
        (n): n is ReportNoteRow & { fileId: string } =>
          n.kind === 'photo' && typeof n.fileId === 'string' && !!n.fileId,
      ),
    [noteRows],
  );

  const { width: screenWidth } = useWindowDimensions();
  // Card padding * 2 (left + right) + (COLUMNS - 1) gaps between tiles.
  const usableWidth = Math.max(0, screenWidth - CARD_PADDING * 2);
  const tileSize = Math.floor((usableWidth - GAP * (COLUMNS - 1)) / COLUMNS);

  if (photos.length === 0) return null;

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
      >
        {photos.map((p) => {
          const title = p.body?.trim() || 'Photo';
          return (
            <PhotoGridTile
              key={p.id}
              fileId={p.fileId}
              thumbnailFileId={p.thumbnailFileId ?? null}
              size={tileSize}
              onPress={() => onOpenPhoto?.({ fileId: p.fileId, title })}
              accessibilityLabel={`Open photo ${title}`}
              testID={`btn-report-photo-${p.id}`}
            />
          );
        })}
      </View>
    </Card>
  );
}
