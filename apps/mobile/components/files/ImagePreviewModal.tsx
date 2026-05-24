/**
 * ImagePreviewModal — fullscreen modal for previewing photos from R2.
 *
 * Two modes:
 *   - Single image (legacy): pass `uri` or `fileId` (+ optional
 *     `title` / `cacheKey`). The modal renders one centred image.
 *   - Multi-photo gallery: pass `photos[]` and `initialIndex`. The
 *     modal renders a horizontal paged FlatList — the user swipes
 *     between photos and the header subtitle shows `1 / N`.
 *
 * Either way each tile uses `ImagePreviewBody`, which resolves the
 * signed URL via `useFileSignedUrl(fileId)` (or accepts a pre-resolved
 * `uri`) and renders the image through `CachedImage` (= `expo-image`
 * + disk-cache). The cache entry is pinned to the file id so rotating
 * signed-URL tokens don't invalidate the cached pixels.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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

export interface ImagePreviewPhoto {
  fileId?: string | null;
  uri?: string | null;
  title?: string;
  cacheKey?: string | null;
}

interface ImagePreviewModalProps {
  visible: boolean;
  /** Pre-resolved signed URL (single-image legacy API). */
  uri?: string | null;
  /** R2 file id (single-image legacy API). */
  fileId?: string | null;
  title?: string;
  /** Stable cache key for the single-image API. */
  cacheKey?: string | null;
  /** Gallery of photos. When set with length > 1, swipe is enabled. */
  photos?: ReadonlyArray<ImagePreviewPhoto>;
  /** Index of the photo to show first in gallery mode. */
  initialIndex?: number;
  onClose: () => void;
}

export function ImagePreviewModal({
  visible,
  uri,
  fileId,
  title = 'Image',
  cacheKey,
  photos,
  initialIndex = 0,
  onClose,
}: ImagePreviewModalProps) {
  // Normalize props → a non-empty photos array. Legacy callers pass
  // `uri`/`fileId`/`title`/`cacheKey` directly; we wrap those into a
  // single-element array so the rendering path is uniform.
  const resolvedPhotos = useMemo<ReadonlyArray<ImagePreviewPhoto>>(() => {
    if (photos && photos.length > 0) return photos;
    return [{ uri, fileId, title, cacheKey }];
  }, [photos, uri, fileId, title, cacheKey]);

  const startIndex = clampIndex(initialIndex, resolvedPhotos.length);
  const isGallery = resolvedPhotos.length > 1;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-black" edges={['top', 'bottom']}>
          {visible ? (
            <PreviewContent
              photos={resolvedPhotos}
              startIndex={startIndex}
              isGallery={isGallery}
              fallbackTitle={title}
              onClose={onClose}
            />
          ) : null}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return Math.floor(index);
}

// Mounted only when `visible` so neither the `useFileSignedUrl` queries
// nor `useWindowDimensions` work runs for a closed modal.
function PreviewContent({
  photos,
  startIndex,
  isGallery,
  fallbackTitle,
  onClose,
}: {
  photos: ReadonlyArray<ImagePreviewPhoto>;
  startIndex: number;
  isGallery: boolean;
  fallbackTitle: string;
  onClose: () => void;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const listRef = useRef<FlatList<ImagePreviewPhoto> | null>(null);

  // If the caller changes `initialIndex` while the modal is open, jump
  // to it. (Common case: a gallery shared between two tabs.)
  useEffect(() => {
    setCurrentIndex(startIndex);
  }, [startIndex]);

  const activePhoto = photos[currentIndex] ?? photos[0]!;
  const headerTitle = activePhoto.title ?? fallbackTitle;
  const headerSubtitle = isGallery
    ? `${currentIndex + 1} / ${photos.length}`
    : undefined;

  const handleMomentumScrollEnd = (
    e: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    if (screenWidth <= 0) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    if (next !== currentIndex) setCurrentIndex(next);
  };

  return (
    <>
      <View className="flex-row items-center justify-between px-4 py-2">
        <View className="flex-1 pr-2">
          <ScreenHeader title={headerTitle} subtitle={headerSubtitle} />
        </View>
        <Pressable
          onPress={onClose}
          accessibilityLabel="Close image preview"
          testID="btn-close-image-preview"
          className="rounded-full bg-white/20 p-2"
        >
          <X size={22} color={colors.primary.foreground} />
        </Pressable>
      </View>

      {isGallery ? (
        <FlatList
          ref={listRef}
          data={photos as ImagePreviewPhoto[]}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={startIndex}
          getItemLayout={(_, index) => ({
            length: screenWidth,
            offset: screenWidth * index,
            index,
          })}
          keyExtractor={(item, index) =>
            item.fileId ?? item.uri ?? `photo-${index}`
          }
          onMomentumScrollEnd={handleMomentumScrollEnd}
          testID="image-preview-gallery"
          renderItem={({ item }) => (
            <View
              style={{ width: screenWidth, height: screenHeight - 64 }}
              className="items-center justify-center px-4"
            >
              <ImagePreviewBody
                uri={item.uri ?? null}
                fileId={item.fileId ?? null}
                title={item.title ?? fallbackTitle}
                cacheKey={item.cacheKey ?? null}
                width={screenWidth - 32}
                height={(screenHeight - 64) * 0.9}
              />
            </View>
          )}
        />
      ) : (
        <View className="flex-1 items-center justify-center px-4">
          <ImagePreviewBody
            uri={activePhoto.uri ?? null}
            fileId={activePhoto.fileId ?? null}
            title={activePhoto.title ?? fallbackTitle}
            cacheKey={activePhoto.cacheKey ?? null}
            width={screenWidth - 32}
            height={screenHeight * 0.7}
          />
        </View>
      )}
    </>
  );
}

function ImagePreviewBody({
  uri,
  fileId,
  title,
  cacheKey,
  width,
  height,
}: {
  uri: string | null;
  fileId: string | null;
  title: string;
  cacheKey: string | null;
  width: number;
  height: number;
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
        style={{ width, height }}
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
