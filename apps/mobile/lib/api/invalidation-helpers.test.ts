/**
 * Unit tests for `runInvalidations` and `invalidateAfterFileUpload`.
 * Stay alongside `invalidation.test.ts` (which covers the rule-coverage
 * gate) so both contracts live in one spot.
 */
import { describe, it, expect, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

import { runInvalidations, invalidateAfterFileUpload, INVALIDATIONS_NONE } from './invalidation';

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
    // `usePresignFileMutation` → INVALIDATIONS_NONE
    runInvalidations(qc, 'usePresignFileMutation');
    expect(spy).not.toHaveBeenCalled();
  });

  it('throws when the hook name has no registered rule', () => {
    const { qc } = makeClient();
    expect(() => runInvalidations(qc, 'useDoesNotExistMutation')).toThrow(/no rule registered/);
  });

  it('exports INVALIDATIONS_NONE as a symbol so callers can compare', () => {
    expect(typeof INVALIDATIONS_NONE).toBe('symbol');
  });
});

describe('invalidateAfterFileUpload', () => {
  it('invalidates reportNotes and report heads', async () => {
    const { qc, spy } = makeClient();
    await invalidateAfterFileUpload(qc, { reportId: 'rpt_demo000001' });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, { queryKey: ['reportNotes'] }, { throwOnError: true });
    expect(spy).toHaveBeenNthCalledWith(2, { queryKey: ['report'] }, { throwOnError: true });
  });

  it('resolves only after both active query invalidations settle', async () => {
    const resolvers: Array<() => void> = [];
    const invalidateQueries = vi.fn(() => new Promise<void>((resolve) => resolvers.push(resolve)));
    const qc = { invalidateQueries } as unknown as QueryClient;

    let settled = false;
    const pending = invalidateAfterFileUpload(qc, {
      reportId: 'rpt_demo000001',
    });
    pending.then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(invalidateQueries).toHaveBeenCalledTimes(2);
    expect(settled).toBe(false);
    resolvers.forEach((resolve) => resolve());
    await pending;
    expect(settled).toBe(true);
  });

  it('rejects when either active refetch fails', async () => {
    const refetchError = new Error('report refetch failed');
    const invalidateQueries = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(refetchError);
    const qc = { invalidateQueries } as unknown as QueryClient;

    await expect(invalidateAfterFileUpload(qc, { reportId: 'rpt_demo000001' })).rejects.toBe(
      refetchError,
    );
  });
});
