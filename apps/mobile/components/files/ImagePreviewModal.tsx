/**
 * ImagePreviewModal — fullscreen modal for previewing a single image
 * file from R2.
 *
 * Adapted from
 * `../haru3-reports/apps/mobile/components/files/ImagePreviewModal.tsx`
 * (branch `dev`). Two ways to drive the URL:
 *   - Pass a pre-resolved `uri` (the canonical path the canonical
 *     gallery uses, where adjacent-photo prefetch fans out one signed
 *     URL per tile up front), or
 *   - Pass a `fileId` and let the modal resolve the signed URL itself
 *     via `useFileSignedUrl(fileId)`. The hook caches the URL behind
 *     the file id so reopening the same image inside the 4-minute
 *     stale window is free.
 *
 * The image renders through `CachedImage` (= `expo-image` +
 * disk-cache + 200ms cross-fade). We pin the cache entry to the file
 * id so rotating signed-URL tokens don't invalidate the cached pixels.
 */
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { CachedImage } from '@/components/ui/CachedImage';
import { useFileSignedUrl } from '@/lib/uploads/useFileSignedUrl';
import { colors } from '@/lib/design-tokens/colors';

interface ImagePreviewModalProps {
  visible: boolean;
  /** Pre-resolved signed URL. Mutually exclusive with `fileId`. */
  uri?: string | null;
  /** R2 file id — the modal resolves the signed URL via `useFileSignedUrl`. */
  fileId?: string | null;
  title?: string;
  onClose: () => void;
  /**
   * Stable cache key — defaults to `fileId` so disk cache survives
   * signed-URL rotation. Explicit value wins when both are provided.
   */
  cacheKey?: string | null;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function ImagePreviewModal({
  visible,
  uri,
  fileId,
  title = 'Image',
  onClose,
  cacheKey,
}: ImagePreviewModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-black" edges={['top', 'bottom']}>
          <View className="flex-row items-center justify-between px-4 py-2">
            <ScreenHeader title={title} />
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close image preview"
              testID="btn-close-image-preview"
              className="rounded-full bg-white/20 p-2"
            >
              <X size={22} color={colors.primary.foreground} />
            </Pressable>
          </View>
          <View className="flex-1 items-center justify-center px-4">
            {visible ? (
              <ImagePreviewBody
                uri={uri ?? null}
                fileId={fileId ?? null}
                title={title}
                cacheKey={cacheKey ?? null}
              />
            ) : null}
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

// Resolution-bearing child. Mounted only when `visible` so the
// `useFileSignedUrl` query never runs for a closed modal — that
// matters for callers that don't wrap their screen tree in a
// `QueryClientProvider` (e.g. `screens/saved-report.test.tsx`).
function ImagePreviewBody({
  uri,
  fileId,
  title,
  cacheKey,
}: {
  uri: string | null;
  fileId: string | null;
  title: string;
  cacheKey: string | null;
}) {
  const { data, isLoading } = useFileSignedUrl(fileId, {
    enabled: !uri && Boolean(fileId),
  });
  const resolvedUri =
    uri ?? (data as { url?: string } | undefined)?.url ?? null;
  const effectiveCacheKey = cacheKey ?? fileId ?? undefined;

  if (resolvedUri) {
    return (
      <CachedImage
        source={{ uri: resolvedUri }}
        cacheKey={effectiveCacheKey}
        style={{ width: SCREEN_WIDTH - 32, height: SCREEN_HEIGHT * 0.7 }}
        contentFit="contain"
        testID="image-preview"
        accessibilityLabel={title}
      />
    );
  }
  return (
    <ActivityIndicator
      size="large"
      color={colors.primary.foreground}
      testID={isLoading ? 'image-preview-loading' : 'image-preview-loading'}
    />
  );
}
