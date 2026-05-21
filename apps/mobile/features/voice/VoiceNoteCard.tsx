/**
 * VoiceNoteCard — draft-side (generate screen) voice-note row.
 *
 * Renders both server-saved voice notes and in-flight/failed rows from
 * the `useVoiceNotePipeline` state machine. The three-state header
 * (`Uploading… / Transcribing… / Voice note (ready) / Voice note failed`)
 * is derived in `voiceNoteCardHeader.ts` so the pure logic is testable
 * in node.
 *
 * Layout: shared `NoteCardHeader` (author + timestamp + kebab trailing
 * slot) → status row (mic/play button + label + duration + retry) →
 * optional summary → optional inline transcript panel revealed by the
 * kebab.
 *
 * Playback uses the global `useAudioPlayback()` provider so only one
 * note plays at a time (arch-voice-pipeline.md §D7). The signed R2
 * GET URL is fetched lazily via `useFileSignedUrl(fileId)` on first
 * play tap to avoid burning a presign per row.
 *
 * Per AGENTS.md #4 / Pitfall 12: no `Alert.alert`. The failed-state
 * inline pill + retry button is the entire failure UX.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Mic, MoreVertical, Pause, Play, RotateCw } from 'lucide-react-native';

import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { useAudioPlayback } from '@/lib/audio/AudioPlaybackProvider';
import { useFileSignedUrl } from '@/lib/uploads/useFileSignedUrl';
import { colors } from '@/lib/design-tokens/colors';
import type { NoteEntry } from '@/lib/note-entry';

import {
  deriveVoiceCardHeader,
  formatDuration,
} from './voiceNoteCardHeader';

export interface VoiceNoteCardProps {
  entry: NoteEntry;
  sourceIndex: number;
  authorName?: string;
  /** Called when the user taps "Retry" on a failed row. */
  onRetry?: (sourceIndex: number) => void;
}

export function VoiceNoteCard({
  entry,
  sourceIndex,
  authorName,
  onRetry,
}: VoiceNoteCardProps) {
  const header = deriveVoiceCardHeader(entry);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const fileId = entry.fileId ?? null;
  const signedUrlQuery = useFileSignedUrl(fileId, {
    // Only burn a presign once the row is saved + the user is likely
    // to interact (header is `ready`). Pending/failed rows skip.
    enabled: header.canPlay,
  });
  const audioUri =
    (signedUrlQuery.data as { url?: string } | undefined)?.url ?? null;

  const playback = useAudioPlayback();
  const isPlayingThis =
    playback.status.uri === audioUri && playback.status.playing;
  const positionSec =
    playback.status.uri === audioUri ? playback.status.positionSec : 0;
  const durationSec =
    (playback.status.uri === audioUri ? playback.status.durationSec : 0) ||
    entry.durationSec ||
    0;

  const handlePlayPause = useCallback(() => {
    if (!audioUri) return;
    if (isPlayingThis) playback.pause();
    else void playback.play(audioUri);
  }, [audioUri, isPlayingThis, playback]);

  const handleRetry = useCallback(() => {
    onRetry?.(sourceIndex);
  }, [onRetry, sourceIndex]);

  const title = entry.title?.trim() || null;
  const summary = entry.summary?.trim() || null;
  const transcript = entry.transcript?.trim() || null;

  const kebab = transcript ? (
    <Pressable
      onPress={() => setTranscriptOpen((v) => !v)}
      accessibilityRole="button"
      accessibilityLabel={
        transcriptOpen ? 'Hide transcript' : 'Show transcript'
      }
      hitSlop={8}
      testID={`btn-voice-menu-${sourceIndex}`}
      className="h-7 w-7 items-center justify-center rounded-full"
    >
      <MoreVertical size={16} color={colors.muted.foreground} />
    </Pressable>
  ) : null;

  return (
    <View
      className="rounded-lg border border-border bg-card p-3 gap-2"
      testID={`note-row-${sourceIndex}`}
    >
      <NoteCardHeader
        authorName={authorName}
        capturedAt={entry.addedAt}
        testIDSuffix={sourceIndex}
        trailing={kebab}
      />

      <View className="flex-row items-center gap-2">
        {header.phase === 'uploading' || header.phase === 'transcribing' ? (
          <View
            className="h-8 w-8 items-center justify-center rounded-full bg-muted"
            testID={`voice-status-spinner-${sourceIndex}`}
          >
            <ActivityIndicator size="small" color={colors.muted.foreground} />
          </View>
        ) : (
          <Pressable
            onPress={handlePlayPause}
            disabled={!header.canPlay || !audioUri}
            accessibilityRole="button"
            accessibilityLabel={isPlayingThis ? 'Pause voice note' : 'Play voice note'}
            testID={`btn-voice-play-${sourceIndex}`}
            className={`h-8 w-8 items-center justify-center rounded-full ${
              header.canPlay ? 'bg-primary' : 'bg-muted'
            }`}
          >
            {isPlayingThis ? (
              <Pause size={16} color={colors.primary.foreground} />
            ) : header.canPlay && audioUri ? (
              <Play size={16} color={colors.primary.foreground} />
            ) : (
              <Mic size={16} color={colors.muted.foreground} />
            )}
          </Pressable>
        )}

        <Text
          className="flex-1 text-xs font-medium uppercase text-muted-foreground"
          testID={`voice-status-label-${sourceIndex}`}
        >
          {header.label}
        </Text>

        <Text className="text-xs tabular-nums text-muted-foreground">
          {isPlayingThis
            ? `${formatDuration(positionSec)} / ${formatDuration(durationSec)}`
            : formatDuration(durationSec)}
        </Text>

        {header.showRetry ? (
          <Pressable
            onPress={handleRetry}
            accessibilityRole="button"
            accessibilityLabel="Retry voice note"
            testID={`btn-voice-retry-${sourceIndex}`}
            className="h-7 flex-row items-center gap-1 rounded-md bg-muted px-2"
          >
            <RotateCw size={14} color={colors.muted.foreground} />
            <Text className="text-xs font-medium text-muted-foreground">
              Retry
            </Text>
          </Pressable>
        ) : null}
      </View>

      {header.errorMessage ? (
        <Text
          className="text-xs text-danger-text"
          testID={`voice-error-${sourceIndex}`}
          selectable
        >
          {header.errorMessage}
        </Text>
      ) : null}

      {title ? (
        <Text
          className="text-sm font-semibold text-foreground"
          testID={`voice-title-${sourceIndex}`}
          numberOfLines={2}
        >
          {title}
        </Text>
      ) : null}

      {summary ? (
        <Text
          className="text-sm leading-5 text-foreground"
          testID={`voice-summary-${sourceIndex}`}
          selectable
        >
          {summary}
        </Text>
      ) : null}

      {transcript && transcriptOpen ? (
        <View
          className="rounded-md border border-border bg-muted/40 p-2"
          testID={`voice-transcript-block-${sourceIndex}`}
        >
          <Text
            className="text-xs leading-5 text-muted-foreground"
            testID={`voice-transcript-${sourceIndex}`}
            selectable
          >
            {transcript}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
