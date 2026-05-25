/**
 * NoteTimeline — chronological list of notes captured for a report.
 *
 * P3.6 ported text-only rendering; Phase E (voice pipeline) adds
 * `VoiceNoteCard` dispatch for `source === 'voice'` rows (covers
 * in-flight, failed, and saved voice notes). Photo + pending-upload
 * rows are still deferred to P4.
 *
 * Every saved row's ⋯ kebab opens the shared `NoteOptionsSheet`
 * (Delete, View transcript for voice, Edit for text, metadata) — the
 * same sheet used on the saved-report Notes pane so both surfaces
 * present identical UX. Voice rows surface a `Retry` button on the
 * `failed` state which routes through `onRetryVoice(sourceIndex)`.
 *
 * Delete + edit callbacks are sourceIndex-based so the timeline
 * remains agnostic of persistence — `NotesTabPane` wires them to the
 * `GenerateReportProvider` mutations (`notes.deleteAt` / `notes.update`).
 */
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { TextNoteCard } from '@/components/notes/TextNoteCard';
import { PhotoNoteCard } from '@/components/notes/PhotoNoteCard';
import { PendingPhotoCard } from '@/components/notes/PendingPhotoCard';
import { NoteOptionsSheet } from '@/components/notes/NoteOptionsSheet';
import type { NoteOptionsSheetItem } from '@/components/notes/NoteOptionsSheet';
import { VoiceNoteCard } from '@/components/notes/VoiceNoteCard';
import type { NoteEntry } from '@/lib/notes/note-entry';
import type { UploadJob } from '@/lib/uploads/types';

export interface NoteTimelineProps {
  notes: readonly NoteEntry[];
  isLoading?: boolean;
  error?: Error | null;
  memberNames?: ReadonlyMap<string, string>;
  /** Optional delete handler. Called once the user confirms in the
   *  shared NoteOptionsSheet — no separate confirm dialog needed. */
  onDeleteNote?: (sourceIndex: number) => void;
  /** Optional edit handler. Called with the trimmed new body. */
  onEditNote?: (sourceIndex: number, nextBody: string) => void;
  /** Retry handler for failed voice notes. */
  onRetryVoice?: (sourceIndex: number) => void;
  /** Open the fullscreen photo gallery focussed on this entry's file. */
  onOpenPhoto?: (fileId: string, sourceIndex: number) => void;
  /** Retry a failed image upload job (matches `pendingUpload.jobId`). */
  onRetryPhotoUpload?: (jobId: string) => void;
  /** Cancel/dismiss an in-flight or failed image upload job. */
  onCancelPhotoUpload?: (jobId: string) => void;
}

export function NoteTimeline({
  notes,
  isLoading,
  error,
  memberNames,
  onDeleteNote,
  onEditNote,
  onRetryVoice,
  onOpenPhoto,
  onRetryPhotoUpload,
  onCancelPhotoUpload,
}: NoteTimelineProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const activeItem = useMemo<NoteOptionsSheetItem | null>(() => {
    if (activeIndex === null) return null;
    const entry = notes[activeIndex];
    if (!entry) return null;
    const kind: NoteOptionsSheetItem['kind'] =
      entry.source === 'voice'
        ? 'voice'
        : entry.source === 'image'
          ? 'photo'
          : 'text';
    return {
      id: entry.id ?? `note-${activeIndex}`,
      kind,
      body: entry.text ?? null,
      title: entry.title ?? null,
      summary: entry.summary ?? null,
      transcript: entry.transcript ?? null,
      authorName: entry.authorId
        ? memberNames?.get(entry.authorId) ?? null
        : null,
      capturedAt: entry.addedAt,
      durationSec: entry.durationSec ?? null,
      fileId: entry.fileId ?? null,
    };
  }, [activeIndex, notes, memberNames]);

  const handleOpenOptions = (sourceIndex: number) => setActiveIndex(sourceIndex);
  const handleClose = () => setActiveIndex(null);

  const handleSheetDelete = onDeleteNote
    ? () => {
        if (activeIndex === null) return;
        const idx = activeIndex;
        // Close the sheet first so the host gets a clean unmount
        // before the list re-renders without the deleted entry.
        setActiveIndex(null);
        onDeleteNote(idx);
      }
    : undefined;

  const handleSheetEdit = onEditNote
    ? (_note: NoteOptionsSheetItem, nextBody: string) => {
        if (activeIndex === null) return;
        const idx = activeIndex;
        setActiveIndex(null);
        onEditNote(idx, nextBody);
      }
    : undefined;

  if (isLoading) {
    return (
      <Text className="text-sm text-muted-foreground" testID="note-timeline-loading">
        Loading…
      </Text>
    );
  }

  if (error) {
    return (
      <Text className="text-sm text-danger-foreground" selectable>
        Could not load notes: {error.message}
      </Text>
    );
  }

  if (notes.length === 0) return null;

  return (
    <View className="gap-2" testID="note-timeline">
      {notes.map((entry, index) => {
        const authorName = entry.authorId
          ? memberNames?.get(entry.authorId)
          : undefined;
        if (entry.source === 'voice') {
          return (
            <VoiceNoteCard
              key={entry.id ?? `note-${index}`}
              entry={entry}
              sourceIndex={index}
              authorName={authorName}
              onRetry={onRetryVoice}
              onOpenOptions={handleOpenOptions}
            />
          );
        }
        const isImage = entry.source === 'image';
        if (isImage) {
          // Batch photo entry (multiple files or multiple pending)
          const isBatch =
            (entry.pendingFiles && entry.pendingFiles.length > 1) ||
            (entry.files && entry.files.length > 1);

          if (isBatch || !entry.pendingUpload) {
            // Batch OR resolved single photo → PhotoNoteCard (handles both via PhotoBatchGrid)
            return (
              <PhotoNoteCard
                key={entry.id ?? `note-${index}`}
                entry={entry}
                sourceIndex={index}
                authorName={authorName}
                onOpen={onOpenPhoto}
                onOpenOptions={handleOpenOptions}
              />
            );
          }

          // Solo pending upload → legacy PendingPhotoCard
          const job: UploadJob = {
            id: entry.pendingUpload.jobId,
            input: {
              sourceUri: entry.pendingUpload.sourceUri,
              kind: 'image',
              filename: '',
              contentType: 'image/jpeg',
              sizeBytes: 0,
            },
            status: entry.pendingUpload.status,
            progress: entry.pendingUpload.progress,
            attempt: 1,
            error: entry.pendingUpload.error,
          };
          return (
            <PendingPhotoCard
              key={entry.id ?? `note-${index}`}
              job={job}
              sourceIndex={index}
              authorName={authorName}
              onRetry={onRetryPhotoUpload}
              onCancel={onCancelPhotoUpload}
            />
          );
        }
        return (
          <TextNoteCard
            key={entry.id ?? `note-${index}`}
            entry={entry}
            sourceIndex={index}
            authorName={authorName}
            onOpenOptions={handleOpenOptions}
          />
        );
      })}

      <NoteOptionsSheet
        visible={activeItem !== null}
        note={activeItem}
        onClose={handleClose}
        onDelete={handleSheetDelete}
        onEdit={handleSheetEdit}
      />
    </View>
  );
}
