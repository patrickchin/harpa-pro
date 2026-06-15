import { describe, expect, it } from 'vitest';
import {
  getDeleteDraftDialogCopy,
  getDeleteFileDialogCopy,
  getDeleteNoteDialogCopy,
  getDeleteProjectDialogCopy,
  getDeleteReportDialogCopy,
  getDeleteVoiceNoteDialogCopy,
  getFinalizeReportDialogCopy,
  getRemoveMemberDialogCopy,
  getUnfinalizeReportDialogCopy,
} from './app-dialog-copy';

describe('lib/dialogs/app-dialog-copy', () => {
  it('uses sentence case for centralized dialog titles', () => {
    expect(getDeleteDraftDialogCopy().title).toBe('Delete draft');
    expect(getDeleteProjectDialogCopy().title).toBe('Delete project');
    expect(getDeleteReportDialogCopy().title).toBe('Delete report');
    expect(getFinalizeReportDialogCopy().title).toBe('Finalize report');
    expect(getUnfinalizeReportDialogCopy().title).toBe('Unfinalize report');
    expect(getRemoveMemberDialogCopy('Pat').title).toBe('Remove member');
    expect(getDeleteVoiceNoteDialogCopy().title).toBe('Delete voice note');
    expect(getDeleteNoteDialogCopy().title).toBe('Delete note');
    expect(getDeleteFileDialogCopy('photo.jpg').title).toBe('Delete file');
  });

  it('uses sentence case for the finalize report action label', () => {
    expect(getFinalizeReportDialogCopy().confirmLabel).toBe('Finalize report');
  });
});
