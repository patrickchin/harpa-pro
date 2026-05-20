/**
 * `CachedImage` — thin wrapper around `expo-image`'s `<Image>` with
 * the defaults required for project file thumbnails and previews.
 *
 * Ported verbatim from `../haru3-reports/apps/mobile/components/ui/CachedImage.tsx`
 * (branch `dev`) — same behaviour:
 *
 *   - `cachePolicy="disk"` — pixels persist across launches (the
 *     built-in RN `<Image>` has no disk cache).
 *   - Optional `cacheKey` — pin the cache entry to a stable storage
 *     path so rotating signed-URL tokens don't invalidate the cache.
 *   - 200 ms cross-fade transition on load.
 *   - `intrinsicWidth` / `intrinsicHeight` props drive
 *     `style.aspectRatio` to prevent layout shift while loading.
 *   - `blurhash` placeholder when neither a thumbnail nor an explicit
 *     `placeholder` is provided.
 *
 * Local file URIs (e.g. a fresh camera capture) are fine here too —
 * `expo-image` skips its remote cache for `file://` sources.
 *
 * v4 deviation from canonical: no image-load telemetry sink yet
 * (`recordImageLoad` lands in P3.15.4). The hook points are wired so
 * we can plug it in without touching call sites.
 */
import { Image, type ImageProps } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';

export interface CachedImageProps extends ImageProps {
  /** Pixel width of the source image, used for aspect-ratio placeholder. */
  intrinsicWidth?: number | null;
  /** Pixel height of the source image, used for aspect-ratio placeholder. */
  intrinsicHeight?: number | null;
  /**
   * Stable cache key (e.g. storage path) so rotating signed-URL tokens
   * don't invalidate the disk cache. Forwarded to `expo-image`.
   */
  cacheKey?: string;
  /**
   * Encoded BlurHash. When `placeholder` is not provided, the blurhash
   * is rendered as the placeholder so the user sees a colour
   * approximation of the image immediately.
   */
  blurhash?: string | null;
}

export function CachedImage({
  intrinsicWidth,
  intrinsicHeight,
  cachePolicy = 'disk',
  contentFit = 'cover',
  transition = 200,
  style,
  cacheKey,
  blurhash,
  placeholder,
  source,
  ...rest
}: CachedImageProps) {
  const hasIntrinsicSize =
    typeof intrinsicWidth === 'number' &&
    typeof intrinsicHeight === 'number' &&
    Number.isFinite(intrinsicWidth) &&
    Number.isFinite(intrinsicHeight) &&
    intrinsicWidth > 0 &&
    intrinsicHeight > 0;
  const aspectStyle = hasIntrinsicSize
    ? { aspectRatio: intrinsicWidth / intrinsicHeight }
    : null;
  const composedStyle: StyleProp<ImageStyle> = aspectStyle
    ? [aspectStyle, style as StyleProp<ImageStyle>]
    : (style as StyleProp<ImageStyle>);

  // expo-image's `cacheKey` lives on the source object alongside `uri`.
  // We accept it as a top-level prop for ergonomics and merge it in.
  const composedSource =
    cacheKey && source && typeof source === 'object' && !Array.isArray(source)
      ? { ...(source as object), cacheKey }
      : source;

  // Prefer an explicit `placeholder` (e.g. a thumbnail signed URL);
  // fall back to the BlurHash so the user always sees something.
  const composedPlaceholder = placeholder ?? (blurhash ? { blurhash } : undefined);

  return (
    <Image
      {...rest}
      source={composedSource}
      placeholder={composedPlaceholder}
      cachePolicy={cachePolicy}
      contentFit={contentFit}
      transition={transition}
      style={composedStyle as ImageProps['style']}
    />
  );
}
