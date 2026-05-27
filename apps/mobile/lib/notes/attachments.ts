/**
 * Attachment — unified per-photo shape consumed by the photo UI
 * (PhotoTile, PhotoBatchGrid). One ordered array drives every state
 * (saved, pending, failed, overflow). This module is the
 * transitional adapter while NoteEntry still carries the legacy
 * `files` / `pendingFiles` / `pendingUpload` / `fileId` lanes. T10
 * removes the legacy fields and lets callers read `entry.attachments`
 * directly.
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
 * Derive the unified attachment list from a NoteEntry's legacy photo
 * fields. Saved files first (sorted by `position`), then pending
 * files in queue order. Falls back to the legacy single-file fields
 * (`pendingUpload`, `fileId`) when no batch info is present so this
 * adapter handles every shape the queue + server can currently emit.
 */
export function buildAttachments(entry: NoteEntry): readonly Attachment[] {
  if (entry.source !== 'image') return [];
  const out: Attachment[] = [];

  if (entry.files?.length) {
    const sorted = [...entry.files].sort((a, b) => a.position - b.position);
    for (const f of sorted) {
      out.push({
        key: f.id,
        fileId: f.fileId,
        thumbnailFileId: f.thumbnailFileId,
        sourceUri: null,
        isPending: false,
        position: f.position,
      });
    }
  }

  if (entry.pendingFiles?.length) {
    const basePosition = out.length;
    entry.pendingFiles.forEach((p, idx) => {
      out.push({
        key: p.jobId,
        fileId: null,
        thumbnailFileId: null,
        sourceUri: p.sourceUri,
        isPending: true,
        jobId: p.jobId,
        status: p.status,
        progress: p.progress,
        error: p.error,
        position: basePosition + idx,
      });
    });
  }

  if (out.length === 0 && entry.pendingUpload) {
    const p = entry.pendingUpload;
    out.push({
      key: p.jobId,
      fileId: null,
      thumbnailFileId: null,
      sourceUri: p.sourceUri,
      isPending: true,
      jobId: p.jobId,
      status: p.status,
      progress: p.progress,
      error: p.error,
      position: 0,
    });
  }

  if (out.length === 0 && entry.fileId) {
    out.push({
      key: entry.id ?? entry.fileId,
      fileId: entry.fileId,
      thumbnailFileId: entry.thumbnailFileId ?? null,
      sourceUri: null,
      isPending: false,
      position: 0,
    });
  }

  return out;
}
