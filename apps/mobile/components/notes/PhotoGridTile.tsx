/**
 * `PhotoGridTile` — small square thumbnail used everywhere a photo
 * note is rendered outside the fullscreen preview.
 *
 * Resolves a signed GET URL for `thumbnailFileId ?? fileId` and
 * renders the bytes through `CachedImage` (`expo-image` + disk
 * cache). When `thumbnailFileId` is set we fetch the small client-
 * generated variant (~30 KB); otherwise we fall back to the full
 * image so legacy notes still render in the grid without a backfill.
 *
 * Used by:
 *   - `ReportPhotos` (saved-report 3-column photo grid)
 *   - `PhotoNoteCard` / `ImageNoteCard` (Generate-screen timeline
 *     mini-tile)
 *   - `PhotoNoteRow` (saved-report Notes pane mini-tile)
 *
 * Caller controls the size by passing `size`. Default 110 px matches
 * the timeline mini-tile spec; the grid passes the screen-width-
 * derived cell size.
 */
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Camera } from 'lucide-react-native';

import { CachedImage } from '@/components/ui/CachedImage';
import { useFileSignedUrl } from '@/lib/uploads/useFileSignedUrl';
import { colors } from '@/lib/design-tokens/colors';

export interface PhotoGridTileProps {
  /** Primary file id for the photo. Required so the fullscreen
   *  preview opens the full-resolution image. */
  fileId: string | null;
  /** Optional small variant used to render the tile bytes. Falls back
   *  to `fileId` when null/undefined. */
  thumbnailFileId?: string | null;
  /** Pixel side length of the square tile. Defaults to 110. */
  size?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

export function PhotoGridTile({
  fileId,
  thumbnailFileId,
  size = 110,
  onPress,
  accessibilityLabel,
  testID,
}: PhotoGridTileProps) {
  const sourceFileId = thumbnailFileId ?? fileId;
  const { data, isLoading } = useFileSignedUrl(sourceFileId ?? undefined);
  const uri = (data as { url?: string } | undefined)?.url ?? null;
  const dimensions = { width: size, height: size };

  const body = uri ? (
    <CachedImage
      source={{ uri }}
      cacheKey={sourceFileId ?? undefined}
      style={dimensions}
      contentFit="cover"
      accessibilityLabel={accessibilityLabel}
      testID={testID ? `${testID}-img` : undefined}
    />
  ) : (
    <View
      style={dimensions}
      className="items-center justify-center bg-muted"
      testID={testID ? `${testID}-${isLoading ? 'loading' : 'empty'}` : undefined}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.muted.foreground} />
      ) : (
        <Camera size={20} color={colors.muted.foreground} />
      )}
    </View>
  );

  if (!onPress) {
    return (
      <View
        className="overflow-hidden rounded-md bg-muted"
        style={dimensions}
        testID={testID}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={!fileId}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      className="overflow-hidden rounded-md bg-muted"
      style={dimensions}
    >
      {body}
    </Pressable>
  );
}
