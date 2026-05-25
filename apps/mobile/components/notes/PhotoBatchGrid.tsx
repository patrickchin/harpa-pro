/**
 * PhotoBatchGrid — renders a batch of photos in a 3-column grid.
 *
 * Shows up to 9 tiles. When >9 items exist, the 9th tile displays
 * a "+N" overlay badge. Single-item batches render as one tile
 * (identical to the old single-photo card layout).
 */
import { Text, View, useWindowDimensions } from 'react-native';

import { CachedImage } from '@/components/ui/CachedImage';
import { PhotoGridTile } from '@/components/notes/PhotoGridTile';
import type { NoteEntry } from '@/lib/notes/note-entry';

const COLUMNS = 3;
const GAP = 6;
const MAX_VISIBLE = 9;
// Card horizontal padding (p-3 = 12px each side)
const CARD_H_PADDING = 24;

export interface PhotoBatchGridProps {
  entry: NoteEntry;
  /** Called when a resolved file tile is tapped. */
  onOpenFile?: (fileId: string, index: number) => void;
  /** Card-interior width override (defaults to screen width - 32 - card padding). */
  containerWidth?: number;
}

interface GridItem {
  type: 'resolved' | 'pending';
  key: string;
  fileId?: string | null;
  thumbnailFileId?: string | null;
  sourceUri?: string;
  progress?: number;
  isOverflow?: boolean;
  overflowCount?: number;
}

function buildGridItems(entry: NoteEntry): GridItem[] {
  const items: GridItem[] = [];

  // Resolved files first (sorted by position)
  if (entry.files?.length) {
    const sorted = [...entry.files].sort((a, b) => a.position - b.position);
    for (const f of sorted) {
      items.push({
        type: 'resolved',
        key: f.id,
        fileId: f.fileId,
        thumbnailFileId: f.thumbnailFileId,
      });
    }
  }

  // Then pending files
  if (entry.pendingFiles?.length) {
    for (const p of entry.pendingFiles) {
      items.push({
        type: 'pending',
        key: p.jobId,
        sourceUri: p.sourceUri,
        progress: p.progress,
      });
    }
  }

  // Also check legacy single pendingUpload
  if (!items.length && entry.pendingUpload) {
    items.push({
      type: 'pending',
      key: entry.pendingUpload.jobId,
      sourceUri: entry.pendingUpload.sourceUri,
      progress: entry.pendingUpload.progress,
    });
  }

  // Also check legacy single fileId
  if (!items.length && entry.fileId) {
    items.push({
      type: 'resolved',
      key: entry.id ?? entry.fileId,
      fileId: entry.fileId,
      thumbnailFileId: entry.thumbnailFileId,
    });
  }

  const total = items.length;
  if (total <= MAX_VISIBLE) return items;

  // Truncate to 8 + overflow tile
  const visible = items.slice(0, MAX_VISIBLE - 1);
  const lastItem = items[MAX_VISIBLE - 1]!;
  visible.push({
    ...lastItem,
    isOverflow: true,
    overflowCount: total - (MAX_VISIBLE - 1),
  });
  return visible;
}

export function PhotoBatchGrid({
  entry,
  onOpenFile,
  containerWidth,
}: PhotoBatchGridProps) {
  const { width: screenWidth } = useWindowDimensions();
  const availableWidth = containerWidth ?? screenWidth - 32 - CARD_H_PADDING;
  const items = buildGridItems(entry);

  if (items.length === 0) return null;

  // For 1-2 items, use actual count as columns
  const cols = Math.min(items.length, COLUMNS);
  const tileSize = Math.floor((availableWidth - GAP * (cols - 1)) / cols);

  return (
    <View className="flex-row flex-wrap" style={{ gap: GAP }}>
      {items.map((item, idx) => (
        <View key={item.key} style={{ width: tileSize, height: tileSize }}>
          {item.type === 'resolved' ? (
            <View className="relative">
              <PhotoGridTile
                fileId={item.fileId ?? null}
                thumbnailFileId={item.thumbnailFileId}
                size={tileSize}
                onPress={
                  item.fileId && onOpenFile
                    ? () => onOpenFile(item.fileId!, idx)
                    : undefined
                }
                accessibilityLabel={`Photo ${idx + 1}`}
                testID={`batch-grid-tile-${idx}`}
              />
              {item.isOverflow && (
                <View className="absolute inset-0 items-center justify-center rounded-md bg-black/50">
                  <Text className="text-lg font-bold text-white">
                    +{item.overflowCount}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View className="relative overflow-hidden rounded-md bg-muted">
              <CachedImage
                source={{ uri: item.sourceUri }}
                cacheKey={item.key}
                style={{ width: tileSize, height: tileSize }}
                contentFit="cover"
                accessibilityLabel={`Pending photo ${idx + 1}`}
                testID={`batch-grid-pending-${idx}`}
              />
              {item.progress !== undefined && item.progress < 1 && (
                <View className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
                  <View
                    className="h-1 bg-primary"
                    style={{ width: `${Math.round(item.progress * 100)}%` }}
                  />
                </View>
              )}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}
