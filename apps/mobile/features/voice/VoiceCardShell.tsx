/**
 * VoiceCardShell — shared layout primitive for voice-note cards.
 *
 * Aligns the in-app rendering with the marketing-page `PreviousNoteCard`
 * (see apps/marketing/src/components/VoiceDemo.tsx). The layout is:
 *
 *   ┌──────────────────────────────────────────┐
 *   │ [▶]  Title (semibold, truncate)          │
 *   │      Author · captured-at                │
 *   │      ▓▓▓▓░░░░░░  1:23 / 2:14   [retry?]  │
 *   │                                          │
 *   │  Summary: short paragraph…               │
 *   │  Show transcript ▾                       │
 *   └──────────────────────────────────────────┘
 *
 * The left button is fully controlled by the caller (play / pause /
 * spinner / mic). The right column composes the title slot, meta
 * line, progress fill, and an optional trailing element (e.g. the
 * "Retry" pill on failed rows).
 *
 * Per AGENTS.md #4 / Pitfall 12: no `Alert.alert` anywhere in the
 * card surface — inline pills + the failed-state shell are the
 * entire failure UX.
 */
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { formatCapturedAt } from '@/lib/date';

import { formatDuration } from './voiceNoteCardHeader';

export interface VoiceCardShellProps {
  /** Left circular control — play / pause / spinner / mic. */
  leftButton: ReactNode;
  /** Bold one-line title at the top of the right column. */
  title?: string | null;
  /** Fallback rendered in place of the title when none is available. */
  titleFallback?: string | null;
  /** Display name for the recording author. */
  authorName?: string | null;
  /** ISO-8601 string, epoch ms, or Date — formatted via formatCapturedAt. */
  capturedAt?: string | number | Date | null;
  /** Current playback position in seconds (0 when not playing). */
  positionSec: number;
  /** Total duration in seconds. */
  durationSec: number;
  /** When true, the progress fill ticks alongside positionSec. */
  isPlaying: boolean;
  /** Optional element rendered to the right of the duration (e.g. Retry). */
  trailing?: ReactNode;
  /** Optional inline error pill below the progress row. */
  errorPill?: ReactNode;
  /** Summary paragraph rendered below the row (bold "Summary: " prefix). */
  summary?: string | null;
  /** Transcript expander block (own pressable + collapsed text). */
  transcript?: ReactNode;
  /** testID forwarded to the outer card. */
  testID?: string;
}

export function VoiceCardShell({
  leftButton,
  title,
  titleFallback,
  authorName,
  capturedAt,
  positionSec,
  durationSec,
  isPlaying,
  trailing,
  errorPill,
  summary,
  transcript,
  testID,
}: VoiceCardShellProps) {
  const titleText = title?.trim() || titleFallback?.trim() || null;
  const summaryText = summary?.trim() || null;
  const capturedDisplay = formatCapturedAt(capturedAt);
  const author = authorName?.trim() || 'Unknown';
  const meta = [author, capturedDisplay].filter(Boolean).join(' · ');

  // Clamp progress to [0, 1]. When duration is unknown (0), show an
  // empty bar rather than dividing by zero.
  const progress =
    durationSec > 0 ? Math.max(0, Math.min(1, positionSec / durationSec)) : 0;
  const durationLabel =
    isPlaying && durationSec > 0
      ? `${formatDuration(positionSec)} / ${formatDuration(durationSec)}`
      : formatDuration(durationSec);

  return (
    <View
      className="rounded-2xl border border-border bg-card p-3 shadow-sm gap-3"
      testID={testID}
    >
      <View className="flex-row items-center gap-3">
        <View className="shrink-0">{leftButton}</View>
        <View className="min-w-0 flex-1 gap-1">
          {titleText ? (
            <Text
              className="text-sm font-semibold text-foreground"
              numberOfLines={1}
            >
              {titleText}
            </Text>
          ) : null}
          {meta ? (
            <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          <View className="mt-1 flex-row items-center gap-2">
            <View className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </View>
            <Text className="text-[11px] tabular-nums text-muted-foreground">
              {durationLabel}
            </Text>
            {trailing ? <View className="ml-1">{trailing}</View> : null}
          </View>
        </View>
      </View>

      {errorPill}

      {summaryText ? (
        <Text
          className="text-xs leading-5 text-muted-foreground"
          selectable
        >
          <Text className="font-semibold text-foreground">Summary: </Text>
          {summaryText}
        </Text>
      ) : null}

      {transcript}
    </View>
  );
}
