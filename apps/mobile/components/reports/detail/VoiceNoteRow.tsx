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
 * Layout matches the marketing-page voice card (apps/marketing/src
 * /components/VoiceDemo.tsx :: PreviousNoteCard) so the in-app
 * experience reads identically. See `VoiceCardShell` for the shared
 * layout primitive.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Mic, Pause, Play } from 'lucide-react-native';

import { useAudioPlayback } from '@/lib/audio/AudioPlaybackProvider';
import { useFileSignedUrl } from '@/lib/uploads/useFileSignedUrl';
import { colors } from '@/lib/design-tokens/colors';

import { VoiceCardShell } from '@/features/voice/VoiceCardShell';

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

  const transcriptText = transcript?.trim() || body?.trim() || null;

  const playButton = (
    <Pressable
      onPress={handlePlayPause}
      disabled={!canPlay || !audioUri}
      accessibilityRole="button"
      accessibilityLabel={isPlayingThis ? 'Pause voice note' : 'Play voice note'}
      testID={`btn-open-voice-${noteId}`}
      className={`h-10 w-10 items-center justify-center rounded-full ${
        canPlay && audioUri ? 'bg-primary' : 'bg-muted'
      }`}
    >
      {canPlay && !audioUri ? (
        <ActivityIndicator size="small" color={colors.muted.foreground} />
      ) : isPlayingThis ? (
        <Pause size={16} color={colors.primary.foreground} />
      ) : canPlay && audioUri ? (
        <Play size={16} color={colors.primary.foreground} />
      ) : (
        <Mic size={16} color={colors.muted.foreground} />
      )}
    </Pressable>
  );

  const transcriptBlock = transcriptText ? (
    <View className="gap-1" testID={`voice-transcript-block-${noteId}`}>
      <Pressable
        onPress={() => setTranscriptOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={transcriptOpen ? 'Hide transcript' : 'Show transcript'}
        testID={`btn-voice-transcript-toggle-${noteId}`}
      >
        <Text className="text-xs font-medium text-primary">
          {transcriptOpen ? 'Hide transcript' : 'Show transcript'}
        </Text>
      </Pressable>
      {transcriptOpen ? (
        <Text
          className="text-xs leading-5 text-muted-foreground"
          testID={`voice-transcript-${noteId}`}
          selectable
        >
          {transcriptText}
        </Text>
      ) : null}
    </View>
  ) : !summary ? (
    <Text className="text-xs italic text-muted-foreground">
      No transcript available.
    </Text>
  ) : null;

  return (
    <VoiceCardShell
      testID={`report-note-${noteId}`}
      leftButton={playButton}
      title={title}
      titleFallback="Voice note"
      authorName={authorName ?? null}
      capturedAt={capturedAt}
      positionSec={positionSec}
      durationSec={totalSec}
      isPlaying={isPlayingThis}
      summary={summary}
      transcript={transcriptBlock}
    />
  );
}
