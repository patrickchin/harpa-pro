/**
 * PhotoTile — the single primitive that renders every state of a
 * photo attachment in the timeline grid:
 *
 *   - pending (<100%)  : sourceUri at 60% opacity + centered ring + small × top-right
 *   - finalizing tail   : sourceUri at 60% opacity (no ring, pulse via opacity)
 *   - done              : sourceUri or server thumbnail at 100% opacity, no overlay
 *   - failed            : sourceUri at 50% opacity + red ⚠️ overlay, tap=retry, long-press=dismiss
 *   - overflow (saved)  : "+N" badge over the underlying tile
 *
 * Keeping every state in one component lets the parent grid hold a
 * stable React key across pending → saved so `expo-image` repaints
 * from its memory cache (no flash, no remount). The dim+ring overlay
 * fades out via Reanimated when `isPending` flips false; the underlying
 * image bytes never re-mount.
 */
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AlertTriangle, X } from 'lucide-react-native';

import { CachedImage } from '@/components/ui/CachedImage';
import { useFileSignedUrl } from '@/lib/uploads/useFileSignedUrl';
import { colors } from '@/lib/design-tokens/colors';
import type { Attachment } from '@/lib/notes/attachments';

import { PhotoProgressRing } from './PhotoProgressRing';

export interface PhotoTileProps {
  attachment: Attachment;
  /** Side length in pixels (square tile). */
  size: number;
  /** Saved-state tap. Receives the resolved `fileId`. No-op for pending. */
  onPress?: (fileId: string) => void;
  /** Pending cancel + failed dismiss share this handler. */
  onCancel?: (jobId: string) => void;
  /** Failed tap-to-retry. */
  onRetry?: (jobId: string) => void;
  /** When set, render a "+N" overflow badge over the tile. */
  overflowCount?: number;
  /**
   * Test ID prefix. Sub-elements are suffixed `${testID}-img`, `${testID}-ring`, etc.
   */
  testID?: string;
}

const FADE_MS = 200;

export function PhotoTile({
  attachment,
  size,
  onPress,
  onCancel,
  onRetry,
  overflowCount,
  testID,
}: PhotoTileProps) {
  const { isPending, status, progress, sourceUri, fileId, thumbnailFileId, jobId, error } =
    attachment;
  const isFailed = status === 'failed';
  const isFinalizing = isPending && !isFailed && (progress ?? 0) >= 1;

  const sourceFileId = thumbnailFileId ?? fileId;
  const { data } = useFileSignedUrl(!isPending && sourceFileId ? sourceFileId : undefined);
  const serverUri = (data as { url?: string } | undefined)?.url ?? null;

  const uri = sourceUri ?? serverUri ?? undefined;
  const cacheKey = attachment.key;

  const overlayOpacity = useSharedValue(isPending || isFailed ? 1 : 0);
  useEffect(() => {
    overlayOpacity.value = withTiming(isPending || isFailed ? 1 : 0, {
      duration: FADE_MS,
    });
  }, [isPending, isFailed]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  const imageOpacity = isFailed ? 0.5 : isPending ? 0.6 : 1;
  const dims = { width: size, height: size };

  const handlePress = () => {
    if (isFailed && onRetry && jobId) {
      onRetry(jobId);
      return;
    }
    if (!isPending && fileId && onPress) {
      onPress(fileId);
    }
  };

  const handleLongPress = () => {
    if (isFailed && onCancel && jobId) onCancel(jobId);
  };

  const a11yLabel = isFailed
    ? 'Photo upload failed. Double-tap to retry, long-press to dismiss.'
    : isPending
      ? `Uploading photo, ${Math.round((progress ?? 0) * 100)} percent`
      : 'Photo, tap to open';

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      disabled={isPending && !isFailed}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={isFailed ? (error ?? undefined) : undefined}
      testID={testID}
      className="overflow-hidden rounded-md bg-muted"
      style={dims}
    >
      {uri ? (
        <CachedImage
          source={{ uri }}
          cacheKey={cacheKey}
          style={[dims, { opacity: imageOpacity }]}
          contentFit="cover"
          testID={testID ? `${testID}-img` : undefined}
        />
      ) : (
        <View style={dims} className="bg-muted" />
      )}

      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'box-none',
          },
          overlayStyle,
        ]}
      >
        {isFailed ? (
          <Animated.View
            testID={testID ? `${testID}-failed` : undefined}
            className="items-center justify-center rounded-full bg-black/40 p-2"
          >
            <AlertTriangle size={24} color={colors.danger.DEFAULT} />
          </Animated.View>
        ) : isPending && !isFinalizing ? (
          <Animated.View testID={testID ? `${testID}-ring` : undefined}>
            <PhotoProgressRing progress={progress} />
          </Animated.View>
        ) : null}
      </Animated.View>

      {isPending && !isFailed && onCancel && jobId ? (
        <Pressable
          onPress={() => onCancel(jobId)}
          accessibilityRole="button"
          accessibilityLabel="Cancel upload"
          hitSlop={6}
          testID={testID ? `${testID}-cancel` : undefined}
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={14} color="white" />
        </Pressable>
      ) : null}

      {overflowCount !== undefined && overflowCount > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            backgroundColor: 'rgba(0,0,0,0.5)',
          }}
        >
          <Text
            testID={testID ? `${testID}-overflow` : undefined}
            className="text-lg font-bold text-white"
          >
            +{overflowCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
