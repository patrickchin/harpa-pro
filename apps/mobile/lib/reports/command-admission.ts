export type ReportCommandBlocker =
  | 'report-unavailable'
  | 'read-only'
  | 'input-pending'
  | 'input-failed'
  | 'edits-pending'
  | 'save-failed'
  | 'write-pending'
  | 'placement-failed';

export interface ReportCommandState {
  ready: boolean;
  draft: boolean;
  canWrite: boolean;
  isOwner: boolean;
  inputPending: boolean;
  inputFailed: boolean;
  editsPending: boolean;
  saveFailed: boolean;
  writePending: boolean;
  placementFailed: boolean;
  hasBody: boolean;
  hasNotes: boolean;
  needsRegeneration: boolean;
  generationFailed: boolean;
}

/** One admission policy for controls, automatic work and command handlers. */
export function reportCommandAdmission(state: ReportCommandState) {
  const blockers: ReportCommandBlocker[] = [];
  if (!state.ready || !state.draft) blockers.push('report-unavailable');
  if (!state.canWrite) blockers.push('read-only');
  if (state.inputPending) blockers.push('input-pending');
  if (state.inputFailed) blockers.push('input-failed');
  if (state.editsPending) blockers.push('edits-pending');
  if (state.saveFailed) blockers.push('save-failed');
  if (state.writePending) blockers.push('write-pending');
  if (state.placementFailed) blockers.push('placement-failed');
  const canGenerate = blockers.length === 0 && (state.hasBody || state.hasNotes);
  return {
    blockers,
    canGenerate,
    canAutoGenerate: canGenerate && state.needsRegeneration && !state.generationFailed,
    canFinalize:
      blockers.length === 0 &&
      state.isOwner &&
      state.hasBody &&
      !state.needsRegeneration &&
      !state.generationFailed,
  };
}
