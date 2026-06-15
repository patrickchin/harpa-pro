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
  /** R2 file id for the small thumbnail variant of an image note.
   *  Null for non-image kinds and for legacy image notes uploaded
   *  before client-side thumbnailing shipped — grid tiles fall back
   *  to `fileId` in that case. */
  thumbnailFileId?: string | null;
  /** Recording length in seconds (server-reported when saved). */
  durationSec?: number | null;
  /** Speech-to-text output. */
  transcript?: string | null;
  /** Phase D pipeline view for in-flight / failed rows. `null` once
   *  the note has been persisted server-side. */
  voiceStatus?: 'uploading' | 'transcribing' | 'failed' | null;
  /** Error message when `voiceStatus === 'failed'`. */
  voiceError?: string | null;

  /** Batch key for grouping (set on synthetic entries from upload queue). */
  batchKey?: string;

  /**
   * Server-side note id the queue has resolved for this synthetic
   * entry (set only on synthetic image entries from
   * `usePhotoUploadEntries`). The `GenerateReportProvider` uses this
   * to dedupe against the saved server row once it lands, ensuring
   * the same React key spans the pending → saved transition and the
   * card doesn't remount (= no flicker).
   */
  noteId?: string;

  /**
   * Optional React-key override. When set, `NoteTimeline` uses this
   * instead of `id` so the timeline can keep a stable identity for a
   * row across the pending → saved transition without rewriting
   * `id` (which downstream mutations and the photo gallery still
   * need to resolve the canonical server row).
   */
  reactKey?: string;

  // ── Unified photo attachments ──────────────────────────────────
  /**
   * Unified ordered list of photo tiles for image-source entries.
   * Solo and batch photos share this shape; voice and text entries
   * leave it undefined.
   */
  attachments?: ReadonlyArray<import('./attachments').Attachment>;

}
