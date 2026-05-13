import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { cn } from '../lib/cn.js';
import type { VoiceTranscriptPanelProps } from '../types.js';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Renders a voice-note transcript. Supports an optional typewriter
 * reveal used by the marketing M2 demo to make the result feel
 * "live" without actually doing transcription.
 *
 * Pure presentational; no audio playback here (host provides that).
 */
export function VoiceTranscriptPanel({
  transcript,
  loading,
  typewriterMsPerChar,
  className,
}: VoiceTranscriptPanelProps) {
  const [revealed, setRevealed] = useState(() =>
    typewriterMsPerChar ? '' : transcript.text,
  );

  useEffect(() => {
    if (!typewriterMsPerChar) {
      setRevealed(transcript.text);
      return;
    }
    setRevealed('');
    let i = 0;
    const handle = setInterval(() => {
      i += 1;
      setRevealed(transcript.text.slice(0, i));
      if (i >= transcript.text.length) {
        clearInterval(handle);
      }
    }, typewriterMsPerChar);
    return () => clearInterval(handle);
  }, [transcript.text, typewriterMsPerChar]);

  return (
    <View
      className={cn(
        'gap-4 rounded-xl border border-border bg-card p-6',
        className,
      )}
    >
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Transcript
        </Text>
        <Text className="text-xs text-muted-foreground">
          {formatDuration(transcript.durationSec)}
        </Text>
      </View>

      {loading ? (
        <View className="gap-2">
          <View className="h-4 w-full animate-pulse rounded bg-muted" />
          <View className="h-4 w-5/6 animate-pulse rounded bg-muted" />
          <View className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        </View>
      ) : (
        <Text className="text-base leading-relaxed text-foreground">
          {revealed}
        </Text>
      )}
    </View>
  );
}
