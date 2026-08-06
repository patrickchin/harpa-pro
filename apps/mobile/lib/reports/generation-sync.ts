export type ReportGenerationStateTestId = 'report-generation-current' | 'report-generation-pending';

/**
 * E2E synchronization state for route-owned automatic generation.
 *
 * A route-owned upload latch covers the local completion → server refetch gap.
 * Once that latch clears, the API's canonical dirty clock proves generation
 * includes every persisted note/file mutation.
 */
export function reportGenerationStateTestId(state: {
  generatedAt: string | null | undefined;
  notesChangedAt: string | null | undefined;
  needsRegeneration: boolean | undefined;
  uploadSyncPending: boolean;
  isGenerating: boolean;
  noteSyncPending: boolean;
  hasSyncError: boolean;
}): ReportGenerationStateTestId {
  if (
    state.uploadSyncPending ||
    state.isGenerating ||
    state.noteSyncPending ||
    state.hasSyncError ||
    state.needsRegeneration !== false
  ) {
    return 'report-generation-pending';
  }

  const generatedAtMs = state.generatedAt ? Date.parse(state.generatedAt) : Number.NaN;
  const notesChangedAtMs = state.notesChangedAt ? Date.parse(state.notesChangedAt) : Number.NaN;
  return Number.isFinite(generatedAtMs) &&
    Number.isFinite(notesChangedAtMs) &&
    generatedAtMs >= notesChangedAtMs
    ? 'report-generation-current'
    : 'report-generation-pending';
}
