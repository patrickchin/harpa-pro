/**
 * `VoiceNoteRow` — read-only voice-memo card rendered in the
 * saved-report Notes tab.
 *
 * v4 saved reports never have in-flight voice notes (uploads landed
 * during the draft session). Playback uses `useAudioPlayback()` for
 * the single-active-player invariant (arch-voice-pipeline §D7), and
 * the R2 GET URL is fetched lazily via `useFileSignedUrl(fileId)` on
 * first play tap.
 *
 * Layout matches the draft-side `VoiceNoteCard`: shared
 * `NoteCardHeader` with a ⋯ kebab in the trailing slot that toggles
 * an inline transcript panel below the card.
 */
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Mic, MoreVertical, Pause, Play } from 'lucide-react-native';

import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { useAudioPlayback } from '@/lib/audio/AudioPlaybackProvider';
import { useFileSignedUrl } from '@/lib/uploads/useFileSignedUrl';
import { colors } from '@/lib/design-tokens/colors';

import { formatDuration } from '@/features/voice/voiceNoteCardHeader';

export interface VoiceNoteRowProps {
  noteId: string;
  fileId: string | null;
  body: string | null;
  transcript?: string | null;
  title?: string | null;
  summary?: string | null;
  durationSec?: number | null;
  authorName?: string | null;
  capturedAt: string | null;
}

export function VoiceNoteRow({
  noteId,
  fileId,
  body,
  transcript,
  title,
  summary,
  durationSec,
  authorName,
  capturedAt,
}: VoiceNoteRowProps) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const canPlay = Boolean(fileId);
  const signedUrlQuery = useFileSignedUrl(fileId, { enabled: canPlay });
  const audioUri =
    (signedUrlQuery.data as { url?: string } | undefined)?.url ?? null;

  const playback = useAudioPlayback();
  const isPlayingThis =
    playback.status.uri === audioUri && playback.status.playing;
  const positionSec =
    playback.status.uri === audioUri ? playback.status.positionSec : 0;
  const totalSec =
    (playback.status.uri === audioUri ? playback.status.durationSec : 0) ||
    durationSec ||
    0;

  const handlePlayPause = useCallback(() => {
    if (!audioUri) return;
    if (isPlayingThis) playback.pause();
    else void playback.play(audioUri);
  }, [audioUri, isPlayingThis, playback]);

  const titleText = title?.trim() || null;
  const summaryText = summary?.trim() || null;
  const transcriptText = transcript?.trim() || body?.trim() || null;

  const kebab = transcriptText ? (
    <Pressable
      onPress={() => setTranscriptOpen((v) => !v)}
      accessibilityRole="button"
      accessibilityLabel={
        transcriptOpen ? 'Hide transcript' : 'Show transcript'
      }
      hitSlop={8}
      testID={`btn-voice-menu-${noteId}`}
      className="h-7 w-7 items-center justify-center rounded-full"
    >
      <MoreVertical size={16} color={colors.muted.foreground} />
    </Pressable>
  ) : null;

  return (
    <View
      className="rounded-lg border border-border bg-card p-3 gap-2"
      testID={`report-note-${noteId}`}
    >
      <NoteCardHeader
        authorName={authorName ?? null}
        capturedAt={capturedAt}
        testIDSuffix={noteId}
        trailing={kebab}
      />

      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={handlePlayPause}
          disabled={!canPlay || !audioUri}
          accessibilityRole="button"
          accessibilityLabel={isPlayingThis ? 'Pause voice note' : 'Play voice note'}
          testID={`btn-open-voice-${noteId}`}
          className={`h-8 w-8 items-center justify-center rounded-full ${
            canPlay && audioUri ? 'bg-primary' : 'bg-muted'
          }`}
        >
          {isPlayingThis ? (
            <Pause size={16} color={colors.primary.foreground} />
          ) : canPlay && audioUri ? (
            <Play size={16} color={colors.primary.foreground} />
          ) : (
            <Mic size={16} color={colors.muted.foreground} />
          )}
        </Pressable>
        <Text className="flex-1 text-xs font-medium uppercase text-muted-foreground">
          Voice note
        </Text>
        <Text className="text-xs tabular-nums text-muted-foreground">
          {isPlayingThis
            ? `${formatDuration(positionSec)} / ${formatDuration(totalSec)}`
            : formatDuration(totalSec)}
        </Text>
      </View>

      {titleText ? (
        <Text
          className="text-sm font-semibold text-foreground"
          testID={`voice-title-${noteId}`}
          numberOfLines={2}
        >
          {titleText}
        </Text>
      ) : null}

      {summaryText ? (
        <Text
          className="text-sm leading-5 text-foreground"
          testID={`voice-summary-${noteId}`}
          selectable
        >
          {summaryText}
        </Text>
      ) : null}

      {transcriptText && transcriptOpen ? (
        <View
          className="rounded-md border border-border bg-muted/40 p-2"
          testID={`voice-transcript-block-${noteId}`}
        >
          <Text
            className="text-xs leading-5 text-muted-foreground"
            testID={`voice-transcript-${noteId}`}
            selectable
          >
            {transcriptText}
          </Text>
        </View>
      ) : !summaryText ? (
        <Text className="text-xs italic text-muted-foreground">
          No transcript available.
        </Text>
      ) : null}
    </View>
  );
}
