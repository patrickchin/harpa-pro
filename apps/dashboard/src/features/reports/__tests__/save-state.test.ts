import { describe, expect, it } from 'vitest';

import {
  canFinalizeReport,
  initialSaveState,
  saveStateReducer,
  saveStateText,
} from '../save-state';

describe('report save state', () => {
  it('moves through dirty, saving, and saved using the server version', () => {
    const dirty = saveStateReducer(initialSaveState('v1'), {
      type: 'changed',
    });
    expect(saveStateText(dirty)).toBe('Unsaved changes');

    const saving = saveStateReducer(dirty, { type: 'saving' });
    expect(saveStateText(saving)).toBe('Saving…');

    const saved = saveStateReducer(saving, {
      type: 'saved',
      updatedAt: 'v2',
    });
    expect(saved).toEqual({ status: 'saved', updatedAt: 'v2' });
    expect(saveStateText(saved)).toBe('Saved');
  });

  it('does not erase a change made while an earlier save is in flight', () => {
    const saving = saveStateReducer(initialSaveState('v1'), {
      type: 'saving',
    });
    const changedAgain = saveStateReducer(saving, { type: 'changed' });
    const staleSuccess = saveStateReducer(changedAgain, {
      type: 'saved',
      updatedAt: 'v2',
    });

    expect(staleSuccess.status).toBe('dirty');
    expect(staleSuccess.updatedAt).toBe('v2');
  });

  it('locks finalization after failure or conflict', () => {
    const failed = saveStateReducer(initialSaveState('v1'), {
      type: 'failed',
      message: 'Network unavailable',
    });
    const conflicted = saveStateReducer(initialSaveState('v1'), {
      type: 'conflict',
      currentUpdatedAt: 'v2',
    });

    expect(saveStateText(failed)).toBe('Save failed');
    expect(saveStateText(conflicted)).toBe('Changed elsewhere');
    expect(canFinalizeReport('owner', failed)).toBe(false);
    expect(canFinalizeReport('owner', conflicted)).toBe(false);
    expect(canFinalizeReport('editor', initialSaveState('v1'))).toBe(false);
    expect(canFinalizeReport('owner', initialSaveState('v1'))).toBe(true);
  });
});
