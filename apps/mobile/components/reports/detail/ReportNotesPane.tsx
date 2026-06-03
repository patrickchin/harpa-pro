/**
 * ReportNotesPane — read-only source-notes timeline for a finalised
 * (or in-progress) saved report. Mirrors the canonical Notes tab from
 * `../haru3-reports/apps/mobile/components/reports/detail/ReportNotesPane.tsx`
 * (branch `dev`): text, voice, photo, and document rows interleaved
 * by `createdAt`, no capture / mutation / pending-upload concerns —
 * saved reports never have in-flight notes.
 *
 * Each kind dispatches to a dedicated row component
 * (inline photo card via `PhotoBatchGrid` / `VoiceNoteRow` /
 * `DocumentNoteRow` / text inline). Photo cards build attachments
 * from the note's `files[]` (canonical post-`note_files` migration)
 * with a single-file fallback for legacy rows. Voice + document
 * rows resolve their R2 GET URL via `useFileSignedUrl` (P3.15.1).
 *
 * Every row's ⋯ kebab opens a shared `NoteOptionsSheet` rendered at
 * the pane level. The sheet exposes metadata, Delete, and (for voice
 * with a transcript) View transcript. Delete goes through
 * `useDeleteNoteMutation`, which auto-invalidates the saved-report
 * notes query so the row disappears once the API confirms.
 */
import { useCallback, useMemo, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { MessageSquare } from 'lucide-react-native';

import { EmptyState } from '@/components/primitives/EmptyState';
import { Skeleton, SkeletonRow } from '@/components/primitives/Skeleton';
import { NoteCardHeader } from '@/components/notes/NoteCardHeader';
import { PhotoBatchGrid } from '@/components/notes/PhotoBatchGrid';
import { VoiceNoteRow } from '@/components/reports/detail/VoiceNoteRow';
import { DocumentNoteRow } from '@/components/reports/detail/DocumentNoteRow';
import { NoteOptionsKebab } from '@/components/notes/NoteOptionsKebab';
import { NoteOptionsSheet } from '@/components/notes/NoteOptionsSheet';
import { useOptimisticDeleteNote } from '@/lib/api/optimistic';
import { attachmentFromSavedFile } from '@/lib/notes/attachments';
import { colors } from '@/lib/design-tokens/colors';

/**
 * One joined `note_files` row, as returned by the API. Image notes
 * carry one of these per attached photo; legacy rows pre-`note_files`
 * leave `files` undefined and fall back to the top-level `fileId`.
 */
export interface ReportNoteFile {
  id: string;
  fileId: string;
  thumbnailFileId: string | null;
  position: number;
  caption?: string | null;
}

export interface ReportNoteRow {
  id: string;
  body: string | null;
  kind: 'text' | 'voice' | 'photo' | 'document';
  /** ISO-8601 timestamp; rendered as-is for now (formatting in P4). */
  createdAt: string | null;
  authorName?: string | null;
  /** R2 file id when the note is backed by a single upload (voice / document, or legacy single-file image). */
  fileId?: string | null;
  /** Thumbnail file id for legacy single-file image notes. */
  thumbnailFileId?: string | null;
  /**
   * For image notes: the canonical `note_files` rows joined to this
   * note, ordered by `position`. One entry per photo in a batch.
   * Undefined / empty for non-image notes and legacy single-file
   * rows that pre-date the `note_files` migration.
   */
  files?: ReadonlyArray<ReportNoteFile> | null;
  /**
   * Stored placement pointer for image-kind notes. Null = unplaced
   * (default). Optional so non-image rows can omit it without ceremony.
   */
  placement?: { kind: 'issue' | 'section'; index: number } | null;
  // ── Voice-only fields (Phase E). Optional so non-voice rows omit them. ──
  transcript?: string | null;
  title?: string | null;
  summary?: string | null;
  durationSec?: number | null;
}

interface ReportNotesPaneProps {
  noteRows: ReadonlyArray<ReportNoteRow> | undefined;
  /**
   * Saved-report id — required so optimistic delete can target the
   * correct `reportNotes` cache page. Optional for backward-compat
   * with snapshot tests rendering this pane outside a real screen;
   * when omitted the kebab Delete affordance is hidden.
   */
  reportId?: string | null;
  /** Opens the fullscreen photo preview modal. */
  onOpenPhoto?: (input: { fileId: string; title?: string }) => void;
  /** Opens a voice / document file via the system handler. */
  onOpenFile?: (input: { fileId: string; uri: string }) => void;
  /**
   * Notes query is still loading. When true and no rows are available
   * yet, the pane renders a skeleton timeline instead of the empty
   * state so users don't briefly see "No source notes" before the
   * notes hydrate.
   */
  isLoading?: boolean;
}

export function ReportNotesPane({
  noteRows,
  reportId,
  onOpenPhoto,
  onOpenFile,
  isLoading = false,
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

  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const activeNote = useMemo(
    () => sorted.find((n) => n.id === activeNoteId) ?? null,
    [sorted, activeNoteId],
  );
  // Adapt `ReportNoteRow` → generic `NoteOptionsSheetItem`. Most
  // fields line up 1:1; only `createdAt` → `capturedAt` is renamed.
  // Image notes pass `files[]` so the sheet can list every File ID
  // in a batch, not just the first one.
  const activeSheetItem = useMemo(
    () =>
      activeNote
        ? {
            id: activeNote.id,
            kind: activeNote.kind,
            body: activeNote.body,
            title: activeNote.title ?? null,
            summary: activeNote.summary ?? null,
            transcript: activeNote.transcript ?? null,
            authorName: activeNote.authorName ?? null,
            capturedAt: activeNote.createdAt,
            durationSec: activeNote.durationSec ?? null,
            fileId: activeNote.fileId ?? null,
            files:
              activeNote.kind === 'photo' && activeNote.files?.length
                ? activeNote.files.map((f) => ({
                    id: f.id,
                    fileId: f.fileId,
                  }))
                : null,
          }
        : null,
    [activeNote],
  );

  const deleteNote = useOptimisticDeleteNote();
  const handleOpenOptions = (id: string) => setActiveNoteId(id);
  const handleCloseOptions = () => setActiveNoteId(null);
  const handleDelete = reportId
    ? (note: { id: string }) => {
        deleteNote.mutate(
          { params: { note: note.id }, reportId },
          {
            onSettled: () => {
              // The row vanishes synchronously via the optimistic cache
              // patch; close the sheet regardless of success/failure so
              // the UI doesn't get stuck if the server rejects.
              setActiveNoteId(null);
            },
          },
        );
      }
    : undefined;

  if (sorted.length === 0) {
    if (isLoading) {
      return (
        <View
          className="px-5 pb-8 pt-2 gap-3"
          testID="report-notes-pane-loading"
          accessibilityRole="progressbar"
          accessibilityLabel="Loading notes"
        >
          <ReportNoteRowSkeleton lines={2} />
          <ReportNoteRowSkeleton withThumbnail lines={1} />
          <ReportNoteRowSkeleton lines={3} />
        </View>
      );
    }
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
        if (note.kind === 'photo') {
          return (
            <PhotoNoteBatchCard
              key={note.id}
              note={note}
              onOpenPhoto={onOpenPhoto}
              onOpenOptions={handleOpenOptions}
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
              onOpenOptions={handleOpenOptions}
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
              onOpenOptions={handleOpenOptions}
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
              trailing={
                <NoteOptionsKebab
                  noteId={note.id}
                  onPress={() => handleOpenOptions(note.id)}
                />
              }
            />
            <Text className="text-sm leading-5 text-foreground">{body}</Text>
          </View>
        );
      })}
      <Text className="mt-2 text-xs text-muted-foreground">
        The original notes this report was generated from.
      </Text>

      <NoteOptionsSheet
        visible={activeSheetItem !== null}
        note={activeSheetItem}
        onClose={handleCloseOptions}
        onDelete={handleDelete}
        deleteInFlight={deleteNote.isPending}
      />
    </View>
  );
}

/**
 * Inline photo-batch card for the read-only saved-report Notes tab.
 * One card per image note, regardless of how many photos the note
 * carries — the underlying `PhotoBatchGrid` lays out 1..N tiles in a
 * 3-column grid (with a "+N" overflow badge past 9). Mirrors
 * `PhotoNoteCard` from the draft timeline; differs in that it never
 * renders pending / failed states (saved reports never have in-flight
 * uploads).
 */
function PhotoNoteBatchCard({
  note,
  onOpenPhoto,
  onOpenOptions,
}: {
  note: ReportNoteRow;
  onOpenPhoto?: (input: { fileId: string; title?: string }) => void;
  onOpenOptions: (id: string) => void;
}) {
  const body = note.body?.trim() ?? '';
  const attachments = useMemo(() => {
    if (note.files && note.files.length > 0) {
      return note.files
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((f, idx) =>
          attachmentFromSavedFile(
            {
              id: f.id,
              fileId: f.fileId,
              thumbnailFileId: f.thumbnailFileId,
            },
            idx,
          ),
        );
    }
    // Legacy single-file fallback: only used for image notes that
    // pre-date the `note_files` migration and never got backfilled.
    if (note.fileId) {
      return [
        attachmentFromSavedFile(
          {
            id: note.id,
            fileId: note.fileId,
            thumbnailFileId: note.thumbnailFileId ?? null,
          },
          0,
        ),
      ];
    }
    return [];
  }, [note.files, note.fileId, note.thumbnailFileId, note.id]);

  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const onLayout = useCallback((ev: LayoutChangeEvent) => {
    const w = ev.nativeEvent.layout.width;
    setContainerWidth((prev) => (prev === w ? prev : w));
  }, []);

  const handleOpen = useCallback(
    (fileId: string) => {
      const title = body || 'Photo';
      onOpenPhoto?.({ fileId, title });
    },
    [body, onOpenPhoto],
  );

  if (attachments.length === 0) {
    // Should be unreachable: an image-kind note that carries neither
    // `files[]` nor a top-level `fileId`. Migration 0010 backfilled
    // every image note into `note_files`, so this branch firing
    // means we either have a corrupted row or a regression in the
    // `toReportNoteRows` adapter. Surface it loudly in dev so we
    // catch it during review instead of silently dropping the card.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        `[ReportNotesPane] image note ${note.id} has no files[] and no fileId — skipping render`,
      );
    }
    return null;
  }

  return (
    <View
      className="rounded-lg border border-border bg-card p-3 gap-2"
      testID={`report-note-${note.id}`}
    >
      <NoteCardHeader
        authorName={note.authorName ?? null}
        capturedAt={note.createdAt}
        testIDSuffix={note.id}
        trailing={
          <NoteOptionsKebab
            noteId={note.id}
            onPress={() => onOpenOptions(note.id)}
          />
        }
      />
      <View onLayout={onLayout} testID={`report-note-${note.id}-measure`}>
        {containerWidth !== null ? (
          <PhotoBatchGrid
            attachments={attachments}
            containerWidth={containerWidth}
            onOpenFile={handleOpen}
            tileTestIDPrefix={`report-photo-${note.id}`}
          />
        ) : null}
      </View>
      {body ? (
        <Text className="text-sm leading-5 text-foreground" selectable>
          {body}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Skeleton placeholder for a single note row. Mirrors the rough
 * silhouette of the real cards (header avatar + name + timestamp,
 * then 1–3 body lines, optional thumbnail) so the layout doesn't
 * jump when notes hydrate.
 */
function ReportNoteRowSkeleton({
  lines = 2,
  withThumbnail = false,
}: {
  lines?: number;
  withThumbnail?: boolean;
}) {
  const lineWidths = ['92%', '78%', '60%'] as const;
  return (
    <View className="rounded-lg border border-border bg-card p-3 gap-2">
      <SkeletonRow>
        <Skeleton circle height={24} />
        <View className="flex-1 gap-1.5">
          <Skeleton width="40%" height={12} />
          <Skeleton width="25%" height={10} />
        </View>
      </SkeletonRow>
      {withThumbnail ? (
        <Skeleton width="100%" height={140} radius={8} />
      ) : (
        <View className="gap-1.5 pt-1">
          {Array.from({ length: lines }).map((_, i) => (
            <Skeleton
              key={i}
              width={lineWidths[Math.min(i, lineWidths.length - 1)]}
              height={12}
            />
          ))}
        </View>
      )}
    </View>
  );
}
