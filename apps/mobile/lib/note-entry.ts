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
  /** LLM-generated summary. Stored separately from `text` so the
   *  card can show summary + transcript without one collapsing the
   *  other. */
  summary?: string | null;
  /** Very short headline derived from `summary` server-side
   *  (≤ 80 chars). Rendered above the summary on voice cards. */
  title?: string | null;
  /** Phase D pipeline view for in-flight / failed rows. `null` once
   *  the note has been persisted server-side. */
  voiceStatus?: 'uploading' | 'transcribing' | 'failed' | null;
  /** Error message when `voiceStatus === 'failed'`. */
  voiceError?: string | null;
}
