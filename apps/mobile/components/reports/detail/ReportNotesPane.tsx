/**
 * ReportNotesPane — read-only source-notes timeline for a finalised
 * (or in-progress) saved report. Mirrors the canonical Notes tab from
 * `../haru3-reports/apps/mobile/components/reports/detail/ReportNotesPane.tsx`
 * (branch `dev`): text, voice, photo, and document rows interleaved
 * by `createdAt`, no capture / mutation / pending-upload concerns —
 * saved reports never have in-flight notes.
 *
 * Each kind dispatches to a dedicated row component
 * (`PhotoNoteRow` / `VoiceNoteRow` / `DocumentNoteRow` / text inline).
 * Photo + voice + document rows resolve their R2 GET URL via
 * `useFileSignedUrl` (P3.15.1) and render through `CachedImage` for
 * the photo thumbnail.
 */
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { MessageSquare } from 'lucide-react-native';

import { EmptyState } from '@/components/primitives/EmptyState';
import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { PhotoNoteRow } from '@/components/reports/detail/PhotoNoteRow';
import { VoiceNoteRow } from '@/components/reports/detail/VoiceNoteRow';
import { DocumentNoteRow } from '@/components/reports/detail/DocumentNoteRow';
import { colors } from '@/lib/design-tokens/colors';

export interface ReportNoteRow {
  id: string;
  body: string | null;
  kind: 'text' | 'voice' | 'photo' | 'document';
  /** ISO-8601 timestamp; rendered as-is for now (formatting in P4). */
  createdAt: string | null;
  authorName?: string | null;
  /** R2 file id when the note is backed by an upload (voice / photo / document). */
  fileId?: string | null;
  // ── Voice-only fields (Phase E). Optional so non-voice rows omit them. ──
  transcript?: string | null;
  title?: string | null;
  summary?: string | null;
  durationSec?: number | null;
}

interface ReportNotesPaneProps {
  noteRows: ReadonlyArray<ReportNoteRow> | undefined;
  /** Opens the fullscreen photo preview modal. */
  onOpenPhoto?: (input: { fileId: string; title?: string }) => void;
  /** Opens a voice / document file via the system handler. */
  onOpenFile?: (input: { fileId: string; uri: string }) => void;
}

export function ReportNotesPane({
  noteRows,
  onOpenPhoto,
  onOpenFile,
}: ReportNotesPaneProps) {
  const sorted = useMemo(() => {
    const items = (noteRows ?? []).slice();
    items.sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return tb - ta;
    });
    return items;
  }, [noteRows]);

  if (sorted.length === 0) {
    return (
      <View className="px-5 pb-8 pt-2" testID="report-notes-pane">
        <EmptyState
          icon={<MessageSquare size={28} color={colors.muted.foreground} />}
          title="No source notes"
          description="This report has no linked notes, voice memos, photos, or documents."
        />
      </View>
    );
  }

  return (
    <View className="px-5 pb-8 pt-2 gap-3" testID="report-notes-pane">
      {sorted.map((note) => {
        if (note.kind === 'photo' && note.fileId) {
          return (
            <PhotoNoteRow
              key={note.id}
              noteId={note.id}
              fileId={note.fileId}
              body={note.body}
              authorName={note.authorName ?? null}
              capturedAt={note.createdAt}
              onOpen={onOpenPhoto}
            />
          );
        }
        if (note.kind === 'voice') {
          return (
            <VoiceNoteRow
              key={note.id}
              noteId={note.id}
              fileId={note.fileId ?? null}
              body={note.body}
              transcript={note.transcript ?? null}
              title={note.title ?? null}
              summary={note.summary ?? null}
              durationSec={note.durationSec ?? null}
              authorName={note.authorName ?? null}
              capturedAt={note.createdAt}
            />
          );
        }
        if (note.kind === 'document') {
          return (
            <DocumentNoteRow
              key={note.id}
              noteId={note.id}
              fileId={note.fileId ?? null}
              body={note.body}
              authorName={note.authorName ?? null}
              capturedAt={note.createdAt}
              onOpen={onOpenFile}
            />
          );
        }
        // Text — render inline (no extra component needed at the
        // read-only surface; edits live on the draft NoteTimeline).
        const body = note.body?.trim() ?? '';
        if (!body) return null;
        return (
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
            <Text className="text-sm leading-5 text-foreground">{body}</Text>
          </View>
        );
      })}
      <Text className="mt-2 text-xs text-muted-foreground">
        The original notes this report was generated from.
      </Text>
    </View>
  );
}
