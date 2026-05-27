/**
 * Attachment — unified per-photo shape consumed by the photo UI
 * (PhotoTile, PhotoBatchGrid). One ordered array drives every state
 * (saved, pending, failed, overflow).
 */
import type { NoteEntry } from './note-entry';

/** Minimal shape required to build a completed Attachment for a saved file. */
export interface SavedFileInput {
  /** Stable id used as the React key (e.g. note_files.id or the R2 fileId). */
  id: string;
  /** R2 file id for the full-resolution image. */
  fileId: string | null;
  /** Optional small-variant R2 file id for thumbnail rendering. */
  thumbnailFileId?: string | null;
}

/**
 * Build a completed, non-pending Attachment from any saved-file record.
 * Use this in components that already hold individual file ids (e.g.
 * ImageNoteCard, PhotoNoteRow, ReportPhotos) so they can feed PhotoTile
 * without going through the full buildAttachments() adapter.
 */
export function attachmentFromSavedFile(
  file: SavedFileInput,
  position = 0,
): Attachment {
  return {
    key: file.id,
    fileId: file.fileId,
    thumbnailFileId: file.thumbnailFileId ?? null,
    sourceUri: null,
    isPending: false,
    jobId: undefined,
    status: 'completed',
    progress: 1,
    error: undefined,
    position,
  };
}

export type AttachmentStatus =
  | 'pending'
  | 'presigning'
  | 'uploading'
  | 'registering'
  | 'creating_note'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Attachment {
  /** Stable React key. `note_files.id` for saved, `jobId` for pending. */
  key: string;
  /** Server file id once registered. Null while pending pre-register. */
  fileId: string | null;
  thumbnailFileId: string | null;
  /** Local URI for the bytes while pending. Null for saved attachments. */
  sourceUri: string | null;
  /** True while the upload pipeline still owns this attachment. */
  isPending: boolean;
  /** Upload job id while pending; undefined once saved. */
  jobId?: string;
  /** Pipeline status while pending; undefined once saved. */
  status?: AttachmentStatus;
  /** [0..1] while pending; undefined once saved. */
  progress?: number;
  /** Set when status === 'failed'. */
  error?: string;
  /** Ordering hint within the parent note. */
  position: number;
}

/**
 * Derive the unified attachment list from a NoteEntry. Returns
 * `entry.attachments` directly when set. Falls back to a single-tile
 * attachment built from `entry.fileId` for legacy single-file image
 * rows that pre-date the attachments field. Returns an empty array
 * for voice and text entries.
 */
export function buildAttachments(entry: NoteEntry): readonly Attachment[] {
  if (entry.source !== 'image') return [];

  if (entry.attachments?.length) return entry.attachments;

  if (entry.fileId) {
    return [
      {
        key: entry.id ?? entry.fileId,
        fileId: entry.fileId,
        thumbnailFileId: entry.thumbnailFileId ?? null,
        sourceUri: null,
        isPending: false,
        position: 0,
      },
    ];
  }

  return [];
}
