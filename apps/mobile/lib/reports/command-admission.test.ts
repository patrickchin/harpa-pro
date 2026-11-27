import { describe, expect, it } from 'vitest';
import { reportCommandAdmission, type ReportCommandState } from './command-admission';

const ready: ReportCommandState = {
  ready: true,
  draft: true,
  canWrite: true,
  isOwner: true,
  inputPending: false,
  inputFailed: false,
  editsPending: false,
  saveFailed: false,
  writePending: false,
  placementFailed: false,
  hasBody: true,
  hasNotes: false,
  needsRegeneration: false,
  generationFailed: false,
};

describe('report command admission', () => {
  it('allows finalizing a saved manual body without requiring an AI timestamp or notes', () => {
    expect(reportCommandAdmission(ready)).toMatchObject({
      canGenerate: true,
      canFinalize: true,
      canAutoGenerate: false,
    });
  });

  it.each([
    { ready: false },
    { draft: false },
    { canWrite: false },
    { inputPending: true },
    { inputFailed: true },
    { editsPending: true },
    { saveFailed: true },
    { writePending: true },
    { placementFailed: true },
  ])('blocks all body writes while the report is unsafe: %j', (blocked) => {
    const result = reportCommandAdmission({ ...ready, ...blocked, needsRegeneration: true });
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.canGenerate).toBe(false);
    expect(result.canAutoGenerate).toBe(false);
    expect(result.canFinalize).toBe(false);
  });

  it('allows editors to generate but reserves finalization for the owner', () => {
    expect(reportCommandAdmission({ ...ready, isOwner: false })).toMatchObject({
      canGenerate: true,
      canFinalize: false,
    });
  });

  it('only generates an empty report after notes exist', () => {
    expect(reportCommandAdmission({ ...ready, hasBody: false }).canGenerate).toBe(false);
    expect(
      reportCommandAdmission({
        ...ready,
        hasBody: false,
        hasNotes: true,
        needsRegeneration: true,
      }),
    ).toMatchObject({ canGenerate: true, canAutoGenerate: true, canFinalize: false });
  });

  it('leaves manual retry available after failure while blocking automatic retry and finalize', () => {
    expect(
      reportCommandAdmission({
        ...ready,
        needsRegeneration: true,
        generationFailed: true,
      }),
    ).toMatchObject({ canGenerate: true, canAutoGenerate: false, canFinalize: false });
  });
});
