/**
 * In-memory note entry used by the Generate screen timeline. Persistent
 * storage (`report_notes` table) lands in P3.7+. For P3.6 only the
 * minimal shape consumed by `NoteTimeline` is defined.
 *
 * Mirrors the canonical `apps/mobile/lib/note-entry.ts` `NoteEntry`
 * shape so v4 hooks/screens can layer on without renames.
 */
export interface NoteEntry {
  /** `report_notes.id` when persisted or optimistically queued. */
  id?: string;
  /** `report_notes.author_id`, used to display the note author. */
  authorId?: string;
  /** True while a text note exists only in the optimistic local cache. */
  isPending?: boolean;
  text: string;
  /** `Date.now()` at the moment the note was added — drives sort order. */
  addedAt: number;
  /** Discriminates the note kind for rendering. */
  source?: 'voice' | 'text' | 'image';

  // ── Generic note-level fields (migration 0004) ─────────────────
  // Nullable on every kind. Today the voice aggregator is the only
  // writer; text / image / document notes may populate them later.
  /** Very short headline (≤ 200 chars). Rendered above `summary`. */
  title?: string | null;
  /** Long-form summary. For voice notes this is the canonical
   *  site-note body (mirrored into `body` server-side for legacy
   *  readers). */
  summary?: string | null;

  // ── Voice-note fields (Phase E) ────────────────────────────────
  // Populated when `source === 'voice'`. `VoiceNoteCard` reads these
  // to render the play affordance, transcript expander, summary
  // preview, and in-flight/failed states. All optional so legacy text
  // / image entries don't have to set them.
  /** R2 file id for the recorded audio. Required for playback. */
  fileId?: string | null;
  /** Recording length in seconds (server-reported when saved). */
  durationSec?: number | null;
  /** Speech-to-text output. */
  transcript?: string | null;
  /** Phase D pipeline view for in-flight / failed rows. `null` once
   *  the note has been persisted server-side. */
  voiceStatus?: 'uploading' | 'transcribing' | 'failed' | null;
  /** Error message when `voiceStatus === 'failed'`. */
  voiceError?: string | null;

  // ── Photo-note in-flight fields ────────────────────────────────
  // Populated for synthetic image entries the GenerateReportProvider
  // stitches in from the upload queue so a `PendingPhotoCard` renders
  // immediately on enqueue (camera / gallery picker). All optional;
  // saved image rows have `fileId` set and `pendingUpload === undefined`.
  /**
   * Carrier for an in-flight or failed image upload. Mirrors the
   * fields `PendingPhotoCard` reads off an `UploadJob` so we don't have
   * to thread the full job type through `NoteEntry`.
   */
  pendingUpload?: {
    jobId: string;
    sourceUri: string;
    status:
      | 'pending'
      | 'presigning'
      | 'uploading'
      | 'registering'
      | 'creating_note'
      | 'completed'
      | 'failed'
      | 'cancelled';
    /** Bytes-uploaded progress in [0, 1]. */
    progress: number;
    /** Error message when status === 'failed'. */
    error?: string;
  } | null;
}
