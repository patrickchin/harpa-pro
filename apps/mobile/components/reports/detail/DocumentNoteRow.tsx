/**
 * `DocumentNoteRow` — read-only document/PDF card rendered in the
 * saved-report Notes tab. Ports the document FileCard variant from
 * `../haru3-reports/apps/mobile/components/files/FileCard.tsx`
 * (branch `dev`), trimmed to read-only for saved reports.
 */
import { Pressable, Text, View } from 'react-native';
import { FileText } from 'lucide-react-native';

import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { useFileSignedUrl } from '@/lib/uploads/useFileSignedUrl';
import { colors } from '@/lib/design-tokens/colors';

export interface DocumentNoteRowProps {
  noteId: string;
  fileId: string | null;
  body: string | null;
  authorName?: string | null;
  capturedAt: string | null;
  onOpen?: (input: { fileId: string; uri: string }) => void;
}

export function DocumentNoteRow({
  noteId,
  fileId,
  body,
  authorName,
  capturedAt,
  onOpen,
}: DocumentNoteRowProps) {
  const { data } = useFileSignedUrl(fileId);
  const uri = (data as { url?: string } | undefined)?.url ?? null;
  const canOpen = Boolean(fileId && uri);
  const title = body?.trim() || 'Document';

  return (
    <Pressable
      onPress={() => {
        if (fileId && uri) onOpen?.({ fileId, uri });
      }}
      disabled={!canOpen}
      accessibilityLabel={`Open ${title}`}
      testID={`report-note-${noteId}`}
      className="rounded-lg border border-border bg-card p-3 gap-1.5"
    >
      <NoteCardHeader
        authorName={authorName ?? null}
        capturedAt={capturedAt}
        testIDSuffix={noteId}
      />
      <View className="flex-row items-center gap-2">
        <View className="h-9 w-9 items-center justify-center rounded-md bg-muted">
          <FileText size={18} color={colors.muted.foreground} />
        </View>
        <View className="flex-1">
          <Text
            className="text-sm font-medium text-foreground"
            numberOfLines={2}
          >
            {title}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {canOpen ? 'Tap to open' : 'Resolving link…'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
