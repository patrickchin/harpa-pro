/**
 * ReportNotesPane — read-only source-notes timeline for a finalised
 * (or in-progress) saved report. Mirrors the Notes tab in the
 * Generate Report screen but without any capture, mutation, or
 * pending-upload concerns — saved reports never have in-flight notes.
 *
 * Adapted from
 * `../haru3-reports/apps/mobile/components/reports/detail/ReportNotesPane.tsx`
 * on branch `dev`. The canonical version composes `useNoteTimeline`,
 * `fetchProjectTeam`, `useOtherReportFileIds`, and `useFileSignedUrl`
 * to render voice / photo / document rows alongside text. None of
 * those v4 primitives have landed yet, so this v4 port renders only
 * text-bodied notes today; the richer timeline lands once the upload
 * pipeline + project-members fetch hooks port (see TODO(P4) below).
 */
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { MessageSquare } from 'lucide-react-native';

import { EmptyState } from '@/components/primitives/EmptyState';
import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { colors } from '@/lib/design-tokens/colors';

export interface ReportNoteRow {
  id: string;
  body: string | null;
  kind: 'text' | 'voice' | 'photo' | 'document';
  /** ISO-8601 timestamp; rendered as-is for now (formatting in P4). */
  createdAt: string | null;
  authorName?: string | null;
}

interface ReportNotesPaneProps {
  noteRows: ReadonlyArray<ReportNoteRow> | undefined;
}

export function ReportNotesPane({ noteRows }: ReportNotesPaneProps) {
  const textNotes = useMemo(
    () =>
      (noteRows ?? []).filter(
        (n) => typeof n.body === 'string' && n.body.trim().length > 0,
      ),
    [noteRows],
  );

  // TODO(P4): port the canonical `useNoteTimeline` + voice / photo /
  // document rendering once `useFileSignedUrl`, `fetchProjectTeam`,
  // and the upload pipeline hooks land. For now we render a plain
  // text-only list so the pane is functional end-to-end.

  return (
    <View className="px-5 pb-8 pt-2" testID="report-notes-pane">
      {textNotes.length > 0 ? (
        <View className="gap-3">
          {textNotes.map((note) => (
            <View
              key={note.id}
              className="rounded-lg border border-border bg-card p-3 gap-1.5"
              testID={`report-note-${note.id}`}
            >
              <NoteCardHeader
                authorName={note.authorName ?? null}
                capturedAt={note.createdAt}
                testIDSuffix={note.id}
              />
              <Text className="text-sm leading-5 text-foreground">
                {note.body}
              </Text>
            </View>
          ))}
          <Text className="mt-4 text-xs text-muted-foreground">
            The original notes this report was generated from.
          </Text>
        </View>
      ) : (
        <EmptyState
          icon={<MessageSquare size={28} color={colors.muted.foreground} />}
          title="No source notes"
          description="This report has no linked notes, voice memos, photos, or documents."
        />
      )}
    </View>
  );
}
