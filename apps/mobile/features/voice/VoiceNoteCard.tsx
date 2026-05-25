/**
 * VoiceNoteCard — draft-side (generate screen) voice-note row.
 *
 * Visually parity with text + photo cards: just a shared
 * `NoteCardHeader` (author + timestamp + kebab) followed by the
 * body (title + summary or transcript preview). Playback lives in
 * the shared `NoteOptionsSheet` opened by the kebab — keeping the
 * inline card free of an extra "voice-only" row that made the
 * timeline look inconsistent across kinds.
 *
 * In-flight / failed states (driven by `useVoiceNotePipeline`) keep
 * a single inline status line (small spinner + label, retry pill on
 * failed). Saved rows show only the header + body.
 *
 * Per AGENTS.md #4 / Pitfall 12: no `Alert.alert`. The failed-state
 * inline pill + retry button is the entire failure UX.
 */
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { RotateCw } from 'lucide-react-native';

import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { NoteOptionsKebab } from '@/components/notes/NoteOptionsKebab';
import { colors } from '@/lib/design-tokens/colors';
import type { NoteEntry } from '@/lib/note-entry';

import { deriveVoiceCardHeader } from './voiceNoteCardHeader';

export interface VoiceNoteCardProps {
  entry: NoteEntry;
  sourceIndex: number;
  authorName?: string;
  /** Called when the user taps "Retry" on a failed row. */
  onRetry?: (sourceIndex: number) => void;
  /** Opens the shared `NoteOptionsSheet` (play, view transcript,
   *  delete, metadata). Only available on saved rows. */
  onOpenOptions?: (sourceIndex: number) => void;
}

export function VoiceNoteCard({
  entry,
  sourceIndex,
  authorName,
  onRetry,
  onOpenOptions,
}: VoiceNoteCardProps) {
  const header = deriveVoiceCardHeader(entry);

  const handleRetry = useCallback(() => {
    onRetry?.(sourceIndex);
  }, [onRetry, sourceIndex]);

  const title = entry.title?.trim() || null;
  const summary = entry.summary?.trim() || null;
  const transcript = entry.transcript?.trim() || null;

  // Kebab only when the row is saved and the parent provides the
  // shared options sheet. In-flight rows hide it to keep the
  // pipeline state machine in charge of UX (cancel/retry only).
  const kebab =
    onOpenOptions && header.phase === 'ready' ? (
      <NoteOptionsKebab
        noteId={sourceIndex}
        onPress={() => onOpenOptions(sourceIndex)}
      />
    ) : null;

  const isInFlight =
    header.phase === 'uploading' || header.phase === 'transcribing';
  const isFailed = header.phase === 'failed';

  return (
    <View
      className="rounded-lg border border-border bg-card p-3 gap-1.5"
      testID={`note-row-${sourceIndex}`}
    >
      <NoteCardHeader
        authorName={authorName}
        capturedAt={entry.addedAt}
        testIDSuffix={sourceIndex}
        trailing={kebab}
      />

      {isInFlight ? (
        <View
          className="flex-row items-center gap-2"
          testID={`voice-status-${sourceIndex}`}
        >
          <ActivityIndicator size="small" color={colors.muted.foreground} />
          <Text
            className="flex-1 text-xs text-muted-foreground"
            testID={`voice-status-label-${sourceIndex}`}
          >
            {header.label}
          </Text>
        </View>
      ) : null}

      {isFailed ? (
        <View
          className="flex-row items-center gap-2"
          testID={`voice-status-${sourceIndex}`}
        >
          <Text
            className="flex-1 text-xs text-danger-text"
            testID={`voice-status-label-${sourceIndex}`}
          >
            {header.label}
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
      ) : null}

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
      ) : transcript ? (
        <Text
          className="text-xs leading-5 text-muted-foreground"
          testID={`voice-transcript-preview-${sourceIndex}`}
          numberOfLines={2}
        >
          {transcript}
        </Text>
      ) : null}
    </View>
  );
}
