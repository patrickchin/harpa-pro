/**
 * ImagePreviewModal — fullscreen modal for previewing photos from R2.
 *
 * Twitter/X-inspired: black backdrop, translucent overlay chrome that
 * fades on tap, PagerView for swipe navigation, pinch-to-zoom via
 * ZoomableImage, thumbnail placeholders for instant display.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { X } from 'lucide-react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { ZoomableImage } from '@/components/files/ZoomableImage';
import { useFileSignedUrl } from '@/lib/uploads/useFileSignedUrl';
import { colors } from '@/lib/design-tokens/colors';

export interface ImagePreviewPhoto {
  fileId?: string | null;
  thumbnailFileId?: string | null;
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
  const resolvedPhotos = useMemo<ReadonlyArray<ImagePreviewPhoto>>(() => {
    if (photos && photos.length > 0) return photos;
    return [{ uri, fileId, thumbnailFileId: null, title, cacheKey }];
  }, [photos, uri, fileId, title, cacheKey]);

  const startIndex = clampIndex(initialIndex, resolvedPhotos.length);
  const isGallery = resolvedPhotos.length > 1;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View className="flex-1">
            {visible ? (
              <PreviewContent
                photos={resolvedPhotos}
                startIndex={startIndex}
                isGallery={isGallery}
                fallbackTitle={title}
                onClose={onClose}
              />
            ) : null}
          </View>
        </GestureHandlerRootView>
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
  const [chromeVisible, setChromeVisible] = useState(true);
  const [anyZoomed, setAnyZoomed] = useState(false);
  const zoomedSet = useRef<Set<string>>(new Set());
  const chromeOpacity = useSharedValue(1);
  const dismissY = useSharedValue(0);

  useEffect(() => {
    setCurrentIndex(startIndex);
  }, [startIndex]);

  useEffect(() => {
    chromeOpacity.value = withTiming(chromeVisible ? 1 : 0, { duration: 150 });
  }, [chromeOpacity, chromeVisible]);

  // Chrome fades with toggle AND during dismiss drag
  const chromeStyle = useAnimatedStyle(() => {
    const dismissFade = Math.min(Math.abs(dismissY.value) / 80, 1);
    return { opacity: chromeOpacity.value * (1 - dismissFade) };
  });

  const activePhoto = photos[currentIndex] ?? photos[0]!;
  const headerTitle = activePhoto.title ?? fallbackTitle;
  const headerSubtitle = isGallery
    ? `${currentIndex + 1} / ${photos.length}`
    : null;

  const toggleChrome = useCallback(() => {
    setChromeVisible((prev) => !prev);
  }, []);

  const onChildZoomChange = useCallback((key: string, isZoomed: boolean) => {
    if (isZoomed) zoomedSet.current.add(key);
    else zoomedSet.current.delete(key);
    setAnyZoomed(zoomedSet.current.size > 0);
  }, []);

  // --- Drag-to-dismiss gesture (iOS Photos style) ---
  const DISMISS_THRESHOLD = 100;

  const dismissPan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!anyZoomed)
        .maxPointers(1)
        .activeOffsetY([-15, 15])
        .failOffsetX([-10, 10])
        .onUpdate((e) => {
          dismissY.value = e.translationY;
        })
        .onEnd(() => {
          if (Math.abs(dismissY.value) > DISMISS_THRESHOLD) {
            runOnJS(onClose)();
          } else {
            dismissY.value = withTiming(0, { duration: 150 });
          }
        }),
    [anyZoomed, dismissY, onClose],
  );

  const dismissContentStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(dismissY.value) / 300, 1);
    return {
      transform: [
        { translateY: dismissY.value },
        { scale: 1 - progress * 0.15 },
      ],
    };
  });

  const dismissBackdropStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(dismissY.value) / 300, 1);
    return {
      backgroundColor: `rgba(0, 0, 0, ${1 - progress * 0.7})`,
    };
  });

  return (
    <GestureDetector gesture={dismissPan}>
      <Animated.View style={[{ flex: 1 }, dismissBackdropStyle]}>
        <StatusBar style="light" hidden={!chromeVisible} />

        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
          {/* Header — in-flow, not overlapping the image */}
          <Animated.View
            pointerEvents={chromeVisible ? 'auto' : 'none'}
            style={chromeStyle}
            className="bg-black/60"
          >
            <View className="flex-row items-center px-4 pb-3 pt-2">
              <Pressable
                onPress={onClose}
                accessibilityLabel="Close image preview"
                testID="btn-close-image-preview"
                className="rounded-full bg-white/15 p-2"
              >
                <X size={22} color={colors.background} />
              </Pressable>

              <View className="min-w-0 flex-1 px-3">
                <Text
                  accessibilityRole="header"
                  className="text-sm font-semibold text-white"
                  numberOfLines={1}
                >
                  {headerTitle}
                </Text>
                {headerSubtitle ? (
                  <Text className="mt-0.5 text-xs text-white/50">
                    {headerSubtitle}
                  </Text>
                ) : null}
              </View>

              {isGallery ? (
                <Text className="text-xs font-medium text-white/60">
                  {currentIndex + 1} / {photos.length}
                </Text>
              ) : null}
            </View>
          </Animated.View>

          {/* Image pager — fills remaining space below the header */}
          <Animated.View style={[{ flex: 1 }, dismissContentStyle]}>
            <PagerView
              initialPage={startIndex}
              scrollEnabled={isGallery && !anyZoomed}
              onPageSelected={(e) => setCurrentIndex(e.nativeEvent.position)}
              style={{ flex: 1 }}
              testID="image-preview-gallery"
            >
              {photos.map((item, index) => {
                const key = item.fileId ?? item.uri ?? `photo-${index}`;
                return (
                  <View
                    key={key}
                    className="flex-1 items-center justify-center"
                  >
                    <ImagePreviewBody
                      uri={item.uri ?? null}
                      fileId={item.fileId ?? null}
                      thumbnailFileId={item.thumbnailFileId ?? null}
                      title={item.title ?? fallbackTitle}
                      cacheKey={item.cacheKey ?? null}
                      width={screenWidth}
                      height={screenHeight}
                      testID={`image-preview-${index}`}
                      onSingleTap={toggleChrome}
                      onZoomChange={(z) => onChildZoomChange(key, z)}
                    />
                  </View>
                );
              })}
            </PagerView>
          </Animated.View>
        </SafeAreaView>
      </Animated.View>
    </GestureDetector>
  );
}

function ImagePreviewBody({
  uri,
  fileId,
  thumbnailFileId,
  title,
  cacheKey,
  width,
  height,
  testID,
  onSingleTap,
  onZoomChange,
}: {
  uri: string | null;
  fileId: string | null;
  thumbnailFileId: string | null;
  title: string;
  cacheKey: string | null;
  width: number;
  height: number;
  testID: string;
  onSingleTap: () => void;
  onZoomChange: (isZoomed: boolean) => void;
}) {
  const { data } = useFileSignedUrl(fileId, {
    enabled: !uri && Boolean(fileId),
  });
  const { data: thumbnailData } = useFileSignedUrl(thumbnailFileId, {
    enabled: !uri && Boolean(thumbnailFileId),
  });
  const resolvedUri =
    uri ?? (data as { url?: string } | undefined)?.url ?? null;
  const thumbnailUri =
    (thumbnailData as { url?: string } | undefined)?.url ?? null;
  const effectiveCacheKey = cacheKey ?? fileId ?? undefined;
  const effectivePlaceholderCacheKey = thumbnailFileId ?? undefined;

  // Always prefer the full-res image; fall back to thumbnail while loading.
  const sourceUri = resolvedUri ?? thumbnailUri;
  const sourceCacheKey = resolvedUri
    ? effectiveCacheKey
    : effectivePlaceholderCacheKey;

  // Track when expo-image has actually downloaded the full-res pixels.
  const [fullImageLoaded, setFullImageLoaded] = useState(!thumbnailFileId);
  // Track the loaded image dimensions from expo-image.
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const handleLoad = useCallback(
    (e: { source?: { width?: number; height?: number } }) => {
      if (resolvedUri) {
        setFullImageLoaded(true);
        if (e.source?.width && e.source?.height) {
          setImageSize({ w: e.source.width, h: e.source.height });
        }
      }
    },
    [resolvedUri],
  );

  // Reset when fileId changes (e.g. swiping between photos in the gallery).
  useEffect(() => {
    setFullImageLoaded(!thumbnailFileId);
  }, [fileId, thumbnailFileId]);

  // Show spinner while full-res image bytes are still downloading.
  const showLoadingOverlay = Boolean(thumbnailFileId) && !fullImageLoaded;

  // Build the info line for the debug footer.
  const currentlyShowingThumbnail = !resolvedUri && Boolean(thumbnailUri);
  const displayedFileId = currentlyShowingThumbnail ? thumbnailFileId : fileId;
  const resolutionLabel = imageSize
    ? `${imageSize.w}×${imageSize.h}`
    : currentlyShowingThumbnail
      ? '256×256 (thumb)'
      : null;

  if (sourceUri) {
    return (
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <ZoomableImage
          source={{ uri: sourceUri }}
          placeholder={thumbnailUri ? { uri: thumbnailUri } : undefined}
          cacheKey={sourceCacheKey}
          placeholderCacheKey={effectivePlaceholderCacheKey}
          width={width}
          height={height}
          contentFit="contain"
          testID={testID}
          accessibilityLabel={title}
          onSingleTap={onSingleTap}
          onZoomChange={onZoomChange}
          onLoad={handleLoad}
        />
        {showLoadingOverlay ? (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            pointerEvents="none"
            testID="image-preview-full-loading"
          >
            <ActivityIndicator size="large" color={colors.background} />
          </View>
        ) : null}
        <View
          style={{
            position: 'absolute',
            bottom: 48,
            left: 0,
            right: 0,
            alignItems: 'center',
          }}
          pointerEvents="none"
          testID="image-preview-info-footer"
        >
          <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }} numberOfLines={1}>
              {[
                displayedFileId,
                resolutionLabel,
                currentlyShowingThumbnail ? '(thumb)' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <ActivityIndicator
      size="large"
      color={colors.background}
      testID="image-preview-loading"
    />
  );
}
