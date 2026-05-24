/**
 * usage-limit-error tests — pin the wire contract for the 403
 * `usage_limit_exceeded` envelope and the `X-Usage-Warning` header.
 */
import { describe, expect, it } from 'vitest';

import { ApiError } from './errors';
import { usageLimitFromError, parseUsageWarning } from './usage-limit-error';

describe('usageLimitFromError', () => {
  it('returns null for non-ApiError values', () => {
    expect(usageLimitFromError(null)).toBeNull();
    expect(usageLimitFromError(undefined)).toBeNull();
    expect(usageLimitFromError(new Error('plain'))).toBeNull();
    expect(usageLimitFromError({ code: 'other' })).toBeNull();
  });

  it('returns null for ApiError with a different code', () => {
    const err = new ApiError({
      code: 'rate_limited',
      message: 'slow down',
      status: 429,
    });
    expect(usageLimitFromError(err)).toBeNull();
  });

  it('returns null when details are missing required fields', () => {
    const err = new ApiError({
      code: 'usage_limit_exceeded',
      message: 'over limit',
      status: 403,
      details: { plan: 'free' },
    });
    expect(usageLimitFromError(err)).toBeNull();
  });

  it('extracts the structured payload when details are well-formed', () => {
    const err = new ApiError({
      code: 'usage_limit_exceeded',
      message: 'Usage limit exceeded for report_generate',
      status: 403,
      details: {
        kind: 'report_generate',
        limit: 5,
        used: 5,
        remaining: 0,
        resetAt: '2026-07-01T00:00:00.000Z',
        plan: 'free',
        overridden: false,
      },
    });
    const out = usageLimitFromError(err);
    expect(out).not.toBeNull();
    expect(out!.kind).toBe('report_generate');
    expect(out!.limit).toBe(5);
    expect(out!.used).toBe(5);
    expect(out!.plan).toBe('free');
    expect(out!.overridden).toBe(false);
  });

  it('tolerates an unbounded (null) limit', () => {
    const err = new ApiError({
      code: 'usage_limit_exceeded',
      message: 'edge case',
      status: 403,
      details: {
        kind: 'ai_input_tokens',
        limit: null,
        used: 0,
        remaining: null,
        resetAt: '2026-07-01T00:00:00.000Z',
        plan: 'enterprise',
        overridden: false,
      },
    });
    expect(usageLimitFromError(err)!.limit).toBeNull();
  });
});

describe('parseUsageWarning', () => {
  it('returns null for missing / blank headers', () => {
    expect(parseUsageWarning(null)).toBeNull();
    expect(parseUsageWarning(undefined)).toBeNull();
    expect(parseUsageWarning('')).toBeNull();
  });

  it('returns null for headers that do not start with near-limit', () => {
    expect(parseUsageWarning('other-warning; foo=bar')).toBeNull();
  });

  it('parses the canonical near-limit header', () => {
    expect(parseUsageWarning('near-limit; bucket=report_generate; pct=80')).toEqual({
      bucket: 'report_generate',
      pct: 80,
    });
  });

  it('returns null when bucket is unknown', () => {
    expect(parseUsageWarning('near-limit; bucket=mystery; pct=90')).toBeNull();
  });

  it('returns null when pct is not numeric', () => {
    expect(parseUsageWarning('near-limit; bucket=report_generate; pct=high')).toBeNull();
  });
});
