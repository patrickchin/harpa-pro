import type { ReactNode } from "react";
import { useRef } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Play, Pause, MoreVertical, Sparkles } from "lucide-react-native";
import { Card } from "../primitives/Card";
import { colors } from "../tokens/colors";
import { formatCapturedAt, formatDurationMs } from "./format";

function useProgressWidthRef() {
  return useRef(0);
}

export interface VoiceNoteCardProps {
  /** Stable id used to suffix all testIDs in this card. */
  testIDSuffix: string | number;

  // Header
  authorName?: string | null;
  capturedAt?: string | null;

  // Optional body content rendered above the player row
  voiceTitle?: string | null;
  voiceSummary?: string | null;

  // Player state
  isPlaying: boolean;
  /** True while the audio is being downloaded or loaded into the player. */
  isLoading?: boolean;
  /** Optional human label shown in place of the timestamps while
   *  loading/downloading ("Loading", "Downloading", ...). */
  loadingLabel?: string | null;
  positionMs: number;
  durationMs: number;

  // Playback callbacks
  onTogglePlay: () => void;
  /** Fired on a tap on the progress bar with a 0..1 ratio. */
  onSeek?: (ratio: number) => void;

  // Transcript + summary state
  transcription?: string | null;
  isTranscribing?: boolean;

  // Summary controls
  canSummarize?: boolean;
  isSummarizing?: boolean;
  summarizeError?: string | null;
  onSummarize?: () => void;
  onRetrySummarize?: () => void;

  // Options menu + delete spinner
  onOpenOptions?: () => void;
  isOptionsBusy?: boolean;

  // Playback error
  playbackError?: string | null;

  /** Slot for host-owned dialog sheets, rendered after the card. */
  children?: ReactNode;
}

/**
 * Presentational voice-note card. Owns the play/pause button, scrubbable
 * progress bar, transcription/summary chrome, and options affordance.
 * The host wires hooks (`useVoiceNotePlayer`, `useDeleteFile`,
 * `useSummarizeVoiceNote`, ...) and dialog sheets around it.
 */
export function VoiceNoteCard({
  testIDSuffix,
  authorName,
  capturedAt,
  voiceTitle,
  voiceSummary,
  isPlaying,
  isLoading,
  loadingLabel,
  positionMs,
  durationMs,
  onTogglePlay,
  onSeek,
  transcription,
  isTranscribing,
  canSummarize,
  isSummarizing,
  summarizeError,
  onSummarize,
  onRetrySummarize,
  onOpenOptions,
  isOptionsBusy,
  playbackError,
  children,
}: VoiceNoteCardProps) {
  const suffix = testIDSuffix;
  const progressRatio =
    durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;
  const title = voiceTitle?.trim() ?? "";
  const summary = voiceSummary?.trim() ?? "";
  const trimmedTranscript = transcription?.trim() ?? "";
  const progressDisabled = Boolean(isLoading) || durationMs <= 0;
  // Mutable width captured by onLayout — lives on a ref so it survives
  // re-renders without forcing a state update.
  const progressWidthRef = useProgressWidthRef();
  const handleProgressLayout = (event: {
    nativeEvent: { layout: { width: number } };
  }) => {
    progressWidthRef.current = event.nativeEvent.layout.width;
  };
  const handleProgressPress = (event: {
    nativeEvent?: { locationX?: number };
  }) => {
    if (progressDisabled || !onSeek) return;
    const widthPx = progressWidthRef.current;
    if (widthPx <= 0) return;
    const locationX = event.nativeEvent?.locationX ?? 0;
    const ratio = Math.min(Math.max(locationX / widthPx, 0), 1);
    onSeek(ratio);
  };

  return (
    <>
      <Card className="gap-2 p-3" testID={`voice-note-card-${suffix}`}>
        <View className="flex-row items-center justify-between gap-2">
          <Text
            className="flex-1 text-[10px] font-medium text-muted-foreground"
            numberOfLines={1}
          >
            {authorName ?? "Unknown author"}
          </Text>
          {capturedAt ? (
            <Text
              className="text-[10px] text-muted-foreground"
              numberOfLines={1}
              testID={`voice-note-captured-at-${suffix}`}
            >
              {formatCapturedAt(capturedAt)}
            </Text>
          ) : null}
        </View>
        {title ? (
          <Text
            className="text-base font-semibold text-foreground"
            numberOfLines={2}
            testID={`voice-note-title-${suffix}`}
          >
            {title}
          </Text>
        ) : null}
        {summary ? (
          <Text
            className="text-sm text-foreground"
            testID={`voice-note-summary-${suffix}`}
          >
            {summary}
          </Text>
        ) : null}
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={onTogglePlay}
            disabled={isLoading}
            accessibilityLabel={isPlaying ? "Pause voice note" : "Play voice note"}
            testID={`btn-voice-note-play-${suffix}`}
            className="h-8 w-8 items-center justify-center rounded-full bg-primary"
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.primary.foreground} />
            ) : isPlaying ? (
              <Pause size={14} color={colors.primary.foreground} />
            ) : (
              <Play size={14} color={colors.primary.foreground} />
            )}
          </Pressable>
          <Pressable
            onLayout={handleProgressLayout}
            onPress={handleProgressPress}
            disabled={progressDisabled}
            accessibilityRole="adjustable"
            accessibilityLabel="Voice note playback position"
            accessibilityValue={{
              min: 0,
              max: Math.round(durationMs / 1000),
              now: Math.round(positionMs / 1000),
            }}
            testID={`voice-note-progress-${suffix}`}
            className="h-5 min-w-0 flex-1 justify-center"
          >
            <View className="h-1.5 overflow-hidden rounded-full bg-muted">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${progressRatio * 100}%` }}
              />
            </View>
          </Pressable>
          <Text className="w-[70px] text-right text-xs text-muted-foreground">
            {loadingLabel ??
              `${formatDurationMs(positionMs)} / ${formatDurationMs(durationMs)}`}
          </Text>
          {onOpenOptions ? (
            <Pressable
              onPress={onOpenOptions}
              hitSlop={8}
              disabled={isOptionsBusy}
              accessibilityLabel="Voice note options"
              testID={`btn-voice-note-options-${suffix}`}
              className="h-8 w-8 items-center justify-center rounded-md"
            >
              {isOptionsBusy ? (
                <ActivityIndicator size="small" color={colors.foreground} />
              ) : (
                <MoreVertical size={18} color={colors.muted.foreground} />
              )}
            </Pressable>
          ) : null}
        </View>
        {isTranscribing ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator size="small" color={colors.muted.foreground} />
            <Text className="text-xs italic text-muted-foreground">
              Transcribing…
            </Text>
          </View>
        ) : trimmedTranscript ? null : (
          <Text className="text-xs italic text-muted-foreground">
            (no transcription yet)
          </Text>
        )}
        {isSummarizing ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator size="small" color={colors.muted.foreground} />
            <Text className="text-xs italic text-muted-foreground">
              Summarizing…
            </Text>
          </View>
        ) : canSummarize && onSummarize ? (
          <Pressable
            onPress={onSummarize}
            accessibilityRole="button"
            accessibilityLabel="Summarize voice note"
            testID={`btn-voice-note-summarize-${suffix}`}
            className="flex-row items-center gap-1 self-start rounded-md px-1 py-0.5"
          >
            <Sparkles size={12} color={colors.primary.DEFAULT} />
            <Text className="text-xs font-medium text-primary">Summarize</Text>
          </Pressable>
        ) : null}
        {summarizeError ? (
          <View className="flex-row items-center gap-2">
            <Text
              className="flex-1 text-xs text-danger-foreground"
              selectable
              testID={`voice-note-summary-error-${suffix}`}
            >
              {summarizeError}
            </Text>
            {onRetrySummarize ? (
              <Pressable
                onPress={onRetrySummarize}
                accessibilityRole="button"
                accessibilityLabel="Retry summarize"
              >
                <Text className="text-xs font-medium text-primary">Retry</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {playbackError ? (
          <Text className="text-xs text-danger-foreground" selectable>
            {playbackError}
          </Text>
        ) : null}
      </Card>
      {children}
    </>
  );
}

// ProgressBar was inlined into VoiceNoteCard above so the testID lives
// on the host Pressable (not on a composite wrapper), keeping
// `findByProps({ testID })` callable in tests.
