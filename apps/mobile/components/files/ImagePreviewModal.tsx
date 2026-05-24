/**
 * ImagePreviewModal — fullscreen modal for previewing one or more
 * images with horizontal swipe to cycle between them.
 *
 * Adapted from
 * `../haru3-reports/apps/mobile/components/files/ImagePreviewModal.tsx`
 * on branch `dev`. The canonical version uses `expo-image` +
 * `CachedImage` to support BlurHash placeholders, intrinsic sizing,
 * and adjacent-photo prefetch. v4 hasn't ported the image-cache
 * pipeline yet, so this port renders the plain RN `Image` and
 * surfaces an ActivityIndicator while the URI is null.
 *
 * Two call shapes are supported so the eventual ReportPhotos wire-up
 * (TODO(P4)) and any one-off previews share the same modal:
 *   - `photos: [{ uri, title? }, ...]` + optional `initialIndex` for
 *     a swipeable gallery
 *   - `uri` + `title` for a single image (kept for existing call sites)
 *
 * TODO(P4): port `CachedImage` + `prefetchImages` + the signed-URL
 * fetch hooks once `useFileSignedUrl` / image-cache land.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { colors } from '@/lib/design-tokens/colors';

export interface PreviewPhoto {
  uri: string;
  title?: string;
}

interface ImagePreviewModalProps {
  visible: boolean;
  onClose: () => void;
  /** Multi-photo gallery. Takes precedence over `uri`. */
  photos?: ReadonlyArray<PreviewPhoto>;
  /** Index of the photo to show first. Clamped to photos.length. */
  initialIndex?: number;
  /** Single-photo shorthand — equivalent to `photos: [{ uri, title }]`. */
  uri?: string | null;
  title?: string;
}

export function ImagePreviewModal({
  visible,
  onClose,
  photos,
  initialIndex = 0,
  uri,
  title = 'Image',
}: ImagePreviewModalProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const resolvedPhotos: ReadonlyArray<PreviewPhoto> = useMemo(() => {
    if (photos && photos.length > 0) return photos;
    if (uri) return [{ uri, title }];
    return [];
  }, [photos, uri, title]);

  const clampedInitialIndex = Math.min(
    Math.max(0, initialIndex),
    Math.max(0, resolvedPhotos.length - 1),
  );
  const [currentIndex, setCurrentIndex] = useState(clampedInitialIndex);
  const listRef = useRef<FlatList<PreviewPhoto>>(null);

  // Reset the current index whenever the modal opens or the input set
  // changes, so reopening doesn't leave us on a stale index.
  useEffect(() => {
    if (!visible) return;
    setCurrentIndex(clampedInitialIndex);
    // Defer to next tick so FlatList has measured.
    const id = setTimeout(() => {
      listRef.current?.scrollToIndex({
        index: clampedInitialIndex,
        animated: false,
      });
    }, 0);
    return () => clearTimeout(id);
  }, [visible, clampedInitialIndex, resolvedPhotos]);

  const handleMomentumScrollEnd = (
    e: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    if (screenWidth <= 0) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    if (next !== currentIndex) setCurrentIndex(next);
  };

  const currentTitle =
    resolvedPhotos[currentIndex]?.title ?? title ?? 'Image';
  const showCounter = resolvedPhotos.length > 1;
  const counterLabel = showCounter
    ? `${currentIndex + 1} / ${resolvedPhotos.length}`
    : null;

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
            <View className="flex-1">
              <ScreenHeader
                title={currentTitle}
                subtitle={counterLabel ?? undefined}
              />
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
          <View className="flex-1">
            {resolvedPhotos.length === 0 ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator
                  size="large"
                  color={colors.primary.foreground}
                  testID="image-preview-loading"
                />
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={resolvedPhotos}
                keyExtractor={(item, idx) => `${idx}:${item.uri}`}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={clampedInitialIndex}
                getItemLayout={(_, index) => ({
                  length: screenWidth,
                  offset: screenWidth * index,
                  index,
                })}
                onMomentumScrollEnd={handleMomentumScrollEnd}
                testID="image-preview-list"
                renderItem={({ item, index }) => (
                  <View
                    style={{ width: screenWidth, height: screenHeight * 0.8 }}
                    className="items-center justify-center px-4"
                  >
                    <Image
                      source={{ uri: item.uri }}
                      style={{
                        width: screenWidth - 32,
                        height: screenHeight * 0.7,
                      }}
                      resizeMode="contain"
                      testID={
                        index === currentIndex
                          ? 'image-preview'
                          : `image-preview-${index}`
                      }
                      accessibilityLabel={item.title ?? title}
                    />
                  </View>
                )}
              />
            )}
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
