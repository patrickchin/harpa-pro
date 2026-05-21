/**
 * `VoiceNoteRow` — read-only voice-memo card rendered in the
 * saved-report Notes tab.
 *
 * v4 saved reports never have in-flight voice notes (uploads landed
 * during the draft session), so this row is intentionally simpler than
 * the draft-side `VoiceNoteCard`: it shows the transcript (persisted
 * as `note.body`), and surfaces an "Open" affordance that fetches the
 * signed audio URL via `useFileSignedUrl`. Playback inside the row
 * lands once the audio-player primitive ports (P4); for now tapping
 * Open exposes the signed URL through the `onOpen` callback so the
 * caller can hand it to the system audio handler.
 */
import { Pressable, Text, View } from 'react-native';
import { Mic } from 'lucide-react-native';

import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { useFileSignedUrl } from '@/lib/uploads/useFileSignedUrl';
import { colors } from '@/lib/design-tokens/colors';

export interface VoiceNoteRowProps {
  noteId: string;
  fileId: string | null;
  body: string | null;
  authorName?: string | null;
  capturedAt: string | null;
  onOpen?: (input: { fileId: string; uri: string }) => void;
}

export function VoiceNoteRow({
  noteId,
  fileId,
  body,
  authorName,
  capturedAt,
  onOpen,
}: VoiceNoteRowProps) {
  const { data } = useFileSignedUrl(fileId);
  const uri = (data as { url?: string } | undefined)?.url ?? null;
  const handlePress = () => {
    if (fileId && uri) onOpen?.({ fileId, uri });
  };
  const canOpen = Boolean(fileId && uri);

  return (
    <View
      className="rounded-lg border border-border bg-card p-3 gap-1.5"
      testID={`report-note-${noteId}`}
    >
      <NoteCardHeader
        authorName={authorName ?? null}
        capturedAt={capturedAt}
        testIDSuffix={noteId}
      />

      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={handlePress}
          disabled={!canOpen}
          accessibilityLabel="Open voice note"
          testID={`btn-open-voice-${noteId}`}
          className="h-8 w-8 items-center justify-center rounded-full bg-muted"
        >
          <Mic size={16} color={colors.muted.foreground} />
        </Pressable>
        <Text className="text-xs font-medium uppercase text-muted-foreground">
          Voice note
        </Text>
      </View>

      {body ? (
        <Text
          className="text-sm leading-5 text-foreground"
          testID={`voice-transcript-${noteId}`}
        >
          {body}
        </Text>
      ) : (
        <Text className="text-xs italic text-muted-foreground">
          No transcript available.
        </Text>
      )}
    </View>
  );
}
