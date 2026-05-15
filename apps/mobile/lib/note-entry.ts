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
  /** `'voice'` when the text came from voice-note transcription. */
  source?: 'voice' | 'text';
}
