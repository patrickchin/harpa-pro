/**
 * Pure helpers for `VoiceNoteCard` — extracted so the unit test can
 * exercise the three-state header (transcribing… / ready / failed)
 * derivation without dragging React into the test environment
 * (Pitfall 13: integration tests should hit real default wiring; for
 * pure-presentational logic we exercise the real helper itself).
 *
 * Two states feed the header label:
 *   1. `entry.voiceStatus` — set on optimistic / failed rows by
 *      `useVoiceNotePipeline`; never set for server-saved rows.
 *   2. `entry.transcript` / `entry.summary` — only present on saved
 *      voice rows.
 */
import type { NoteEntry } from '@/lib/note-entry';

export type VoiceCardPhase = 'uploading' | 'transcribing' | 'ready' | 'failed';

export interface VoiceCardHeader {
  phase: VoiceCardPhase;
  /** Label rendered next to the mic icon. */
  label: string;
  /** Whether the play button should be enabled (file present + saved). */
  canPlay: boolean;
  /** Whether the retry button should render (only on `failed`). */
  showRetry: boolean;
  /** Error message to surface under the row (only on `failed`). */
  errorMessage: string | null;
}

export function deriveVoiceCardHeader(entry: NoteEntry): VoiceCardHeader {
  const status = entry.voiceStatus ?? null;

  if (status === 'failed') {
    return {
      phase: 'failed',
      label: 'Voice note failed',
      canPlay: false,
      showRetry: true,
      errorMessage: entry.voiceError ?? 'Save failed. Tap retry.',
    };
  }
  if (status === 'transcribing') {
    return {
      phase: 'transcribing',
      label: 'Transcribing…',
      canPlay: false,
      showRetry: false,
      errorMessage: null,
    };
  }
  if (status === 'uploading') {
    return {
      phase: 'uploading',
      label: 'Uploading…',
      canPlay: false,
      showRetry: false,
      errorMessage: null,
    };
  }
  // Saved server row — playback enabled as soon as we know the fileId.
  return {
    phase: 'ready',
    label: 'Voice note',
    canPlay: Boolean(entry.fileId),
    showRetry: false,
    errorMessage: null,
  };
}

/** Format a seconds count as `m:ss` (or `0:00` when unknown). */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0 || !Number.isFinite(seconds)) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
