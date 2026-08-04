import { describe, expect, it } from 'vitest';
import { getPgError } from './pg-error.js';

describe('getPgError', () => {
  it('reads a direct PostgreSQL driver error', () => {
    expect(
      getPgError({ code: '23514', message: 'last_owner' }),
    ).toEqual({ code: '23514', message: 'last_owner' });
  });

  it('unwraps a Drizzle query error to its PostgreSQL cause', () => {
    const driverError = Object.assign(new Error('file_upload_lease_rollout_pending'), {
      code: '55000',
    });
    const queryError = Object.assign(new Error('Failed query'), {
      cause: driverError,
    });

    expect(getPgError(queryError)).toEqual({
      code: '55000',
      message: 'file_upload_lease_rollout_pending',
    });
  });

  it('returns undefined for malformed and cyclic cause chains', () => {
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;

    expect(getPgError(null)).toBeUndefined();
    expect(getPgError({ code: 23514 })).toBeUndefined();
    expect(getPgError(cyclic)).toBeUndefined();
  });
});
