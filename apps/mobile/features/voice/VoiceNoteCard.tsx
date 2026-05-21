/**
 * VoiceNoteCard — draft-side (generate screen) voice-note row.
 *
 * Renders both server-saved voice notes and in-flight/failed rows from
 * the `useVoiceNotePipeline` state machine. The three-state header
 * (`Uploading… / Transcribing… / Voice note (ready) / Voice note failed`)
 * is derived in `voiceNoteCardHeader.ts` so the pure logic is testable
 * in node.
 *
 * Layout matches the marketing-page voice card (apps/marketing/src
 * /components/VoiceDemo.tsx :: PreviousNoteCard) — round play button,
 * title + meta in a column, progress fill + duration, then summary
 * and the transcript expander. See `VoiceCardShell` for the shared
 * primitive.
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

import { useAudioPlayback } from '@/lib/audio/AudioPlaybackProvider';
import { useFileSignedUrl } from '@/lib/uploads/useFileSignedUrl';
import { colors } from '@/lib/design-tokens/colors';
import type { NoteEntry } from '@/lib/note-entry';

import { deriveVoiceCardHeader } from './voiceNoteCardHeader';
import { VoiceCardShell } from './VoiceCardShell';

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

  const isWorking = header.phase === 'uploading' || header.phase === 'transcribing';

  const leftButton = isWorking ? (
    <View
      className="h-10 w-10 items-center justify-center rounded-full bg-muted"
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
      className={`h-10 w-10 items-center justify-center rounded-full ${
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
  );

  const retryPill = header.showRetry ? (
    <Pressable
      onPress={handleRetry}
      accessibilityRole="button"
      accessibilityLabel="Retry voice note"
      testID={`btn-voice-retry-${sourceIndex}`}
      className="h-7 flex-row items-center gap-1 rounded-md bg-muted px-2"
    >
      <RotateCw size={14} color={colors.muted.foreground} />
      <Text className="text-[11px] font-medium text-muted-foreground">
        Retry
      </Text>
    </Pressable>
  ) : null;

  const errorPill = header.errorMessage ? (
    <Text
      className="text-xs text-danger-text"
      testID={`voice-error-${sourceIndex}`}
      selectable
    >
      {header.errorMessage}
    </Text>
  ) : null;

  // While the upload / transcribe is still running, the title slot
  // shows the phase label (e.g. "Uploading…") instead of the
  // not-yet-derived LLM title. Once `ready`, the real title takes over
  // (falling back to "Voice note" if the model returned nothing).
  const title = entry.title?.trim() || null;
  const titleSlot = isWorking || !title ? header.label : title;
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

  // Wrap in an outer View so legacy `note-row-{idx}` testIDs / parent
  // selectors keep working without duplicating layout.
  return (
    <View testID={`note-row-${sourceIndex}`}>
      <VoiceCardShell
        leftButton={leftButton}
        title={titleSlot}
        authorName={authorName}
        capturedAt={entry.addedAt}
        positionSec={positionSec}
        durationSec={durationSec}
        isPlaying={isPlayingThis}
        trailing={retryPill}
        errorPill={errorPill}
        summary={entry.summary}
        menu={kebab}
      />
      {transcript && transcriptOpen ? (
        <View
          className="mt-2 rounded-2xl border border-border bg-muted/40 p-3"
          testID={`voice-transcript-block-${sourceIndex}`}
        >
          <Text
            className="text-xs leading-relaxed text-muted-foreground"
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
