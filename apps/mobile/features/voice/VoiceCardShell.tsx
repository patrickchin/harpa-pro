/**
 * VoiceCardShell — shared layout primitive for voice-note cards.
 *
 * Layout, sizes and spacing match the marketing `PreviousNoteCard`
 * (apps/marketing/src/components/VoiceDemo.tsx) byte-for-byte so the
 * in-app and marketing surfaces stay aligned:
 *
 *   ┌──────────────────────────────────────────┐
 *   │ [▶]  Title (text-sm semibold, truncate) ⋯│
 *   │      Author · captured-at (text-[11px])  │
 *   │      ▓▓▓▓░░░░░░  1:23 / 2:14   [retry?]  │
 *   │                                          │
 *   │  Summary: short paragraph… (text-xs)     │
 *   └──────────────────────────────────────────┘
 *
 * The full transcript lives behind the ⋯ kebab in the top-right
 * corner (the caller wires that up via the `menu` prop) so it doesn't
 * dominate the card the way an always-visible expander did. The
 * shell intentionally renders no transcript itself — that surface is
 * owned by each caller because the trigger may be in a popover, a
 * bottom sheet, or a separate row.
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
  /** Left circular control — play / pause / spinner / mic (h-10 w-10). */
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
  /** Kebab menu rendered in the top-right corner of the card. */
  menu?: ReactNode;
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
  menu,
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
      className="rounded-2xl border border-border bg-card p-3 shadow-sm"
      testID={testID}
    >
      <View className="flex-row items-start gap-3">
        <View className="shrink-0">{leftButton}</View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-start gap-2">
            <View className="min-w-0 flex-1">
              {titleText ? (
                <Text
                  className="text-sm font-semibold text-foreground"
                  numberOfLines={1}
                >
                  {titleText}
                </Text>
              ) : null}
              {meta ? (
                <Text
                  className="text-[11px] text-muted-foreground"
                  numberOfLines={1}
                >
                  {meta}
                </Text>
              ) : null}
            </View>
            {menu ? <View className="-mr-1 -mt-1">{menu}</View> : null}
          </View>
          <View className="mt-2 flex-row items-center gap-2">
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

      {errorPill ? <View className="mt-2">{errorPill}</View> : null}

      {summaryText ? (
        <Text
          className="mt-3 text-xs leading-relaxed text-muted-foreground"
          numberOfLines={2}
          selectable
        >
          <Text className="font-bold text-foreground">Summary: </Text>
          {summaryText}
        </Text>
      ) : null}
    </View>
  );
}

