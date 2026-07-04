import { describe, expect, it } from 'vitest';

import { env } from '../env.js';
import {
  FileSizeLimitExceededError,
  assertFileSizeWithinLimit,
} from '../services/file-limits.js';

const MIB = 1024 * 1024;
const NOW = new Date('2026-08-01T00:00:00.000Z');

describe('assertFileSizeWithinLimit', () => {
  it('accepts the exact Free boundary', () => {
    env.FREEMIUM_ENFORCEMENT_ENABLED = '1';
    env.FREEMIUM_ENFORCEMENT_AT = NOW.toISOString();

    expect(() => assertFileSizeWithinLimit(5 * MIB, 'free', NOW)).not.toThrow();
  });

  it('throws typed details one byte over the Free boundary', () => {
    env.FREEMIUM_ENFORCEMENT_ENABLED = '1';
    env.FREEMIUM_ENFORCEMENT_AT = NOW.toISOString();

    let caught: unknown;
    try {
      assertFileSizeWithinLimit(5 * MIB + 1, 'free', NOW);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(FileSizeLimitExceededError);
    expect(caught).toMatchObject({
      code: 'file_size_limit_exceeded',
      details: {
        sizeBytes: 5 * MIB + 1,
        limitBytes: 5 * MIB,
        plan: 'free',
      },
    });
  });

  it('accepts the exact 50 MiB Pro boundary', () => {
    env.FREEMIUM_ENFORCEMENT_ENABLED = '1';
    env.FREEMIUM_ENFORCEMENT_AT = NOW.toISOString();

    expect(() => assertFileSizeWithinLimit(50 * MIB, 'pro', NOW)).not.toThrow();
  });
});
