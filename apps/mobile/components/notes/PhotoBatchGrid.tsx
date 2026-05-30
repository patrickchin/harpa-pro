/**
 * PhotoBatchGrid — lays a flat `Attachment[]` into a 3-column grid.
 *
 * Sizing is driven entirely by the measured `containerWidth` the
 * parent passes in (via `onLayout`) — no `useWindowDimensions`, no
 * hard-coded padding constants. The 3-wide clipping bug in the
 * timeline went away when the math stopped guessing the upstream
 * card padding.
 *
 * Up to 9 tiles render; if more attachments exist the 9th carries a
 * "+N" overflow badge (rendered by `<PhotoTile overflowCount=>`).
 */
import { View } from 'react-native';

import type { Attachment } from '@/lib/notes/attachments';

import { PhotoTile } from './PhotoTile';

const COLUMNS = 3;
const GAP = 6;
const MAX_VISIBLE = 9;

export interface PhotoBatchGridProps {
  attachments: readonly Attachment[];
  /** Card-interior width in pixels. Required so the grid never guesses. */
  containerWidth: number;
  onOpenFile?: (fileId: string) => void;
  onRetryUpload?: (jobId: string) => void;
  onCancelUpload?: (jobId: string) => void;
  tileTestIDPrefix?: string;
}

export function PhotoBatchGrid({
  attachments,
  containerWidth,
  onOpenFile,
  onRetryUpload,
  onCancelUpload,
  tileTestIDPrefix = 'batch-grid-tile',
}: PhotoBatchGridProps) {
  if (attachments.length === 0) return null;

  const total = attachments.length;
  const visible = total <= MAX_VISIBLE
    ? attachments
    : attachments.slice(0, MAX_VISIBLE);
  const overflowAtLast = total > MAX_VISIBLE
    ? total - (MAX_VISIBLE - 1)
    : 0;

  const tileSize = Math.max(
    0,
    Math.floor((containerWidth - GAP * (COLUMNS - 1)) / COLUMNS),
  );

  return (
    <View className="flex-row flex-wrap" style={{ gap: GAP }}>
      {visible.map((a, idx) => {
        const isOverflowTile = overflowAtLast > 0 && idx === MAX_VISIBLE - 1;
        return (
          <View key={a.key} style={{ width: tileSize, height: tileSize }}>
            <PhotoTile
              attachment={a}
              size={tileSize}
              onPress={onOpenFile}
              onRetry={onRetryUpload}
              onCancel={onCancelUpload}
              overflowCount={isOverflowTile ? overflowAtLast : undefined}
              testID={`${tileTestIDPrefix}-${idx}`}
            />
          </View>
        );
      })}
    </View>
  );
}
