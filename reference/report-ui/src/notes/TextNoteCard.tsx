import { View, Text, Pressable, ActivityIndicator } from "react-native";
import type { ReactNode } from "react";
import { MoreVertical } from "lucide-react-native";
import { Card } from "../primitives/Card";
import { colors } from "../tokens/colors";
import { formatCapturedAt } from "./format";

export interface TextNoteCardProps {
  /** Display name of the author. */
  authorName: string;
  /** ISO timestamp shown top-right; falls back to the literal string. */
  capturedAt: string | null | undefined;
  /** The note body. */
  text: string;
  /** When true, shows a spinner in place of the options button. */
  isPending?: boolean;
  /** Fired when the three-dot options button is tapped. When omitted
   *  the button is hidden. */
  onOpenOptions?: () => void;
  /** Stable id used to suffix all testIDs in this card. */
  testIDSuffix?: string | number;
  /** Slot for extra content (e.g. mobile injects its dialog sheets here). */
  children?: ReactNode;
}

/**
 * Presentational text-note card. Header layout (author left, timestamp
 * right, both 10px muted) matches `VoiceNoteCard` and `ImageNoteCard`
 * so timeline rows line up identically across note types.
 */
export function TextNoteCard({
  authorName,
  capturedAt,
  text,
  isPending,
  onOpenOptions,
  testIDSuffix,
  children,
}: TextNoteCardProps) {
  const suffix = testIDSuffix ?? "";
  const capturedDisplay = formatCapturedAt(capturedAt) || "—";
  return (
    <>
      <Card className="gap-1.5 p-3">
        <View className="flex-row items-center justify-between gap-2">
          <Text
            className="flex-1 text-[10px] font-medium text-muted-foreground"
            numberOfLines={1}
            testID={`text-note-author-${suffix}`}
          >
            {authorName}
          </Text>
          <Text
            className="text-[10px] text-muted-foreground"
            numberOfLines={1}
            testID={`text-note-captured-at-${suffix}`}
          >
            {capturedDisplay}
          </Text>
        </View>
        <View className="flex-row items-start gap-2">
          <Text className="flex-1 text-body text-foreground">{text}</Text>
          {onOpenOptions ? (
            <Pressable
              onPress={onOpenOptions}
              hitSlop={8}
              accessibilityLabel="Note options"
              testID={`btn-text-note-options-${suffix}`}
              className="h-7 w-7 items-center justify-center rounded-md"
            >
              <MoreVertical size={16} color={colors.muted.foreground} />
            </Pressable>
          ) : isPending ? (
            <View
              className="h-7 w-7 items-center justify-center"
              testID={`text-note-pending-${suffix}`}
            >
              <ActivityIndicator size="small" color={colors.muted.foreground} />
            </View>
          ) : null}
        </View>
      </Card>
      {children}
    </>
  );
}
