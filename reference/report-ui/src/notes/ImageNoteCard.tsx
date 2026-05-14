import type { ComponentType, ReactNode } from "react";
import { View, Text, Pressable, ActivityIndicator, Image } from "react-native";
import { Image as ImageIcon, MoreVertical } from "lucide-react-native";
import { Card } from "../primitives/Card";
import { colors } from "../tokens/colors";
import { formatCapturedAt } from "./format";

/** Minimal contract for the image renderer. Mobile injects
 *  `CachedImage` (expo-image + disk cache); web falls back to RN Image. */
export interface ImageNoteCardImageProps {
  source: { uri: string };
  cacheKey?: string;
  blurhash?: string;
  intrinsicWidth?: number | null;
  intrinsicHeight?: number | null;
  style?: { width: number; height: number };
  accessibilityLabel?: string;
}

export interface ImageNoteCardProps {
  testIDSuffix: string | number;

  /** Display name of the file's author. Shown above the timestamp. */
  authorName?: string | null;
  /** ISO timestamp shown beneath the author. Falls back to "—" when absent. */
  capturedAt?: string | null;
  /** Pre-formatted byte-size string (e.g. "2.4 MB"). */
  sizeLabel?: string | null;

  /** Signed thumbnail URL. When omitted, an icon placeholder is rendered. */
  thumbnailUri?: string | null;
  thumbnailCacheKey?: string | null;
  blurhash?: string | null;
  intrinsicWidth?: number | null;
  intrinsicHeight?: number | null;

  /** Open-image handler. When omitted the card is non-interactive. */
  onPress?: () => void;
  /** Options handler. When omitted the three-dot button is hidden. */
  onOpenOptions?: () => void;
  /** When true, swaps the options icon for a spinner. */
  isOptionsBusy?: boolean;

  /** Replace the image renderer (mobile injects CachedImage for disk caching). */
  ImageComponent?: ComponentType<ImageNoteCardImageProps>;

  /** Slot for host-owned dialog sheets / overlays. */
  children?: ReactNode;
}

/**
 * Presentational image-note card. Shows a 64×64 thumbnail tile, author /
 * timestamp / size column, and an options button. Pure visual chrome —
 * the host owns signed-URL fetching, share/delete, and viewer modals.
 */
export function ImageNoteCard({
  testIDSuffix,
  authorName,
  capturedAt,
  sizeLabel,
  thumbnailUri,
  thumbnailCacheKey,
  blurhash,
  intrinsicWidth,
  intrinsicHeight,
  onPress,
  onOpenOptions,
  isOptionsBusy,
  ImageComponent,
  children,
}: ImageNoteCardProps) {
  const suffix = testIDSuffix;
  const Img = ImageComponent ?? DefaultImage;
  const capturedDisplay = formatCapturedAt(capturedAt) || "—";

  return (
    <>
      <Card className="flex-row items-start gap-3 p-3">
        <Pressable
          onPress={onPress}
          disabled={!onPress}
          accessibilityLabel="Open photo"
          testID={`btn-open-file-${suffix}`}
          className="flex-1 flex-row items-start gap-3"
        >
          <View className="h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-secondary">
            {thumbnailUri ? (
              <Img
                source={{ uri: thumbnailUri }}
                cacheKey={thumbnailCacheKey ?? undefined}
                blurhash={blurhash ?? undefined}
                intrinsicWidth={intrinsicWidth ?? undefined}
                intrinsicHeight={intrinsicHeight ?? undefined}
                style={{ width: 64, height: 64 }}
                accessibilityLabel="Photo thumbnail"
              />
            ) : (
              <ImageIcon size={20} color={colors.foreground} />
            )}
          </View>
          <View className="flex-1">
            {authorName ? (
              <Text
                className="text-sm font-semibold text-foreground"
                numberOfLines={1}
                testID={`file-author-${suffix}`}
              >
                {authorName}
              </Text>
            ) : null}
            <Text
              className="text-xs text-muted-foreground"
              testID={`file-captured-at-${suffix}`}
            >
              {capturedDisplay}
            </Text>
            {sizeLabel ? (
              <Text className="text-xs text-muted-foreground">{sizeLabel}</Text>
            ) : null}
          </View>
        </Pressable>
        {onOpenOptions ? (
          <Pressable
            onPress={onOpenOptions}
            hitSlop={8}
            disabled={isOptionsBusy}
            accessibilityLabel="Photo options"
            testID={`btn-file-options-${suffix}`}
            className="h-8 w-8 items-center justify-center rounded-md"
          >
            {isOptionsBusy ? (
              <ActivityIndicator size="small" color={colors.foreground} />
            ) : (
              <MoreVertical size={18} color={colors.muted.foreground} />
            )}
          </Pressable>
        ) : null}
      </Card>
      {children}
    </>
  );
}

function DefaultImage({
  source,
  style,
  accessibilityLabel,
}: ImageNoteCardImageProps) {
  return (
    <Image
      source={source}
      style={style}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
