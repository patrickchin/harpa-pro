/**
 * Unit tests for `runInvalidations` and `invalidateAfterFileUpload`.
 * Stay alongside `invalidation.test.ts` (which covers the rule-coverage
 * gate) so both contracts live in one spot.
 */
import { describe, it, expect, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

import {
  runInvalidations,
  invalidateAfterFileUpload,
  INVALIDATIONS_NONE,
} from './invalidation';

function makeClient() {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, 'invalidateQueries');
  return { qc, spy };
}

describe('runInvalidations', () => {
  it('fires invalidateQueries for each head in the rule', () => {
    const { qc, spy } = makeClient();
    // `useCreateNoteMutation` → ['reportNotes', 'report']
    runInvalidations(qc, 'useCreateNoteMutation');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, { queryKey: ['reportNotes'] });
    expect(spy).toHaveBeenNthCalledWith(2, { queryKey: ['report'] });
  });

  it('is a no-op for INVALIDATIONS_NONE rules', () => {
    const { qc, spy } = makeClient();
    // `useStartOtpMutation` → INVALIDATIONS_NONE
    runInvalidations(qc, 'useStartOtpMutation');
    expect(spy).not.toHaveBeenCalled();
  });

  it('throws when the hook name has no registered rule', () => {
    const { qc } = makeClient();
    expect(() => runInvalidations(qc, 'useDoesNotExistMutation')).toThrow(
      /no rule registered/,
    );
  });

  it('exports INVALIDATIONS_NONE as a symbol so callers can compare', () => {
    expect(typeof INVALIDATIONS_NONE).toBe('symbol');
  });
});

describe('invalidateAfterFileUpload', () => {
  it('invalidates reportNotes and report heads', () => {
    const { qc, spy } = makeClient();
    invalidateAfterFileUpload(qc, { reportId: 'rpt_demo000001' });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, { queryKey: ['reportNotes'] });
    expect(spy).toHaveBeenNthCalledWith(2, { queryKey: ['report'] });
  });
});
