/**
 * Unit tests for the pure math in services/usage-limits.ts. The DB
 * paths (loadPlanAndOverride, loadMonthUsage) are exercised by the
 * integration tests; this file pins the wire serialisation invariants
 * and override merge semantics.
 */
import { describe, it, expect } from 'vitest';
import {
  PLAN_LIMITS,
  mergeLimits,
  nextMonthResetAt,
  currentMonthStart,
  UsageLimitExceededError,
  nearLimitWarning,
  NEAR_LIMIT_THRESHOLD,
} from '../services/usage-limits.js';
import type { LimitState } from '../services/usage-limits.js';

describe('mergeLimits', () => {
  it('falls through to plan defaults when override row is null', () => {
    const { limits, overridden } = mergeLimits('free', null);
    expect(limits).toEqual(PLAN_LIMITS.free);
    expect(overridden).toEqual({
      report_generate: false,
      voice_transcribe: false,
      voice_summarize: false,
      ai_input_tokens: false,
      ai_output_tokens: false,
    });
  });

  it('applies positive override values and flags them as overridden', () => {
    const { limits, overridden } = mergeLimits('free', {
      report_generate: 50,
      voice_transcribe: null,
      voice_summarize: null,
      ai_input_tokens: null,
      ai_output_tokens: null,
      expires_at: null,
    });
    expect(limits.report_generate).toBe(50);
    expect(limits.voice_transcribe).toBe(PLAN_LIMITS.free.voice_transcribe);
    expect(overridden.report_generate).toBe(true);
    expect(overridden.voice_transcribe).toBe(false);
  });

  it('translates -1 sentinel to Infinity (explicit unbounded)', () => {
    const { limits, overridden } = mergeLimits('free', {
      report_generate: -1,
      voice_transcribe: null,
      voice_summarize: null,
      ai_input_tokens: null,
      ai_output_tokens: null,
      expires_at: null,
    });
    expect(limits.report_generate).toBe(Number.POSITIVE_INFINITY);
    expect(overridden.report_generate).toBe(true);
  });

  it('ignores expired overrides — falls back to plan', () => {
    const past = new Date('2020-01-01T00:00:00Z');
    const now = new Date('2026-06-01T00:00:00Z');
    const { limits, overridden } = mergeLimits(
      'free',
      {
        report_generate: 999,
        voice_transcribe: null,
        voice_summarize: null,
        ai_input_tokens: null,
        ai_output_tokens: null,
        expires_at: past,
      },
      now,
    );
    expect(limits.report_generate).toBe(PLAN_LIMITS.free.report_generate);
    expect(overridden.report_generate).toBe(false);
  });

  it('honours overrides whose expires_at is in the future', () => {
    const future = new Date('2099-01-01T00:00:00Z');
    const now = new Date('2026-06-01T00:00:00Z');
    const { limits } = mergeLimits(
      'pro',
      {
        report_generate: 10,
        voice_transcribe: null,
        voice_summarize: null,
        ai_input_tokens: null,
        ai_output_tokens: null,
        expires_at: future,
      },
      now,
    );
    expect(limits.report_generate).toBe(10);
  });

  it('enterprise plan is Infinity across all buckets', () => {
    const { limits } = mergeLimits('enterprise', null);
    for (const v of Object.values(limits)) {
      expect(v).toBe(Number.POSITIVE_INFINITY);
    }
  });
});

describe('reset boundaries', () => {
  it('currentMonthStart pins to first instant of the UTC month', () => {
    const now = new Date('2026-06-15T13:45:00Z');
    expect(currentMonthStart(now).toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('nextMonthResetAt rolls into the next UTC month', () => {
    expect(nextMonthResetAt(new Date('2026-06-15T13:45:00Z')).toISOString()).toBe(
      '2026-07-01T00:00:00.000Z',
    );
    expect(nextMonthResetAt(new Date('2026-12-31T23:59:59Z')).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });
});

describe('UsageLimitExceededError', () => {
  it('carries the LimitState used by the error mapper', () => {
    const err = new UsageLimitExceededError({
      kind: 'report_generate',
      limit: 5,
      used: 5,
      remaining: 0,
      resetAt: '2026-07-01T00:00:00.000Z',
      plan: 'free',
      overridden: false,
    });
    expect(err.code).toBe('usage_limit_exceeded');
    expect(err.state.kind).toBe('report_generate');
    expect(err.message).toContain('report_generate');
  });
});

describe('nearLimitWarning (Phase 2)', () => {
  const baseState = (over: Partial<LimitState>): LimitState => ({
    kind: 'report_generate',
    limit: 100,
    used: 0,
    remaining: 100,
    resetAt: '2026-07-01T00:00:00.000Z',
    plan: 'free',
    overridden: false,
    ...over,
  });

  it('returns null when no bucket exceeds the threshold', () => {
    const states = [
      baseState({ kind: 'report_generate', used: 50, limit: 100, remaining: 50 }),
      baseState({ kind: 'ai_input_tokens', used: 100, limit: 1000, remaining: 900 }),
    ];
    expect(nearLimitWarning(states)).toBeNull();
  });

  it('fires at the configured 80% threshold', () => {
    expect(NEAR_LIMIT_THRESHOLD).toBe(0.8);
    const states = [
      baseState({ kind: 'report_generate', used: 80, limit: 100, remaining: 20 }),
    ];
    expect(nearLimitWarning(states)).toBe('near-limit; bucket=report_generate; pct=80');
  });

  it('picks the bucket with the highest utilisation', () => {
    const states = [
      baseState({ kind: 'report_generate', used: 90, limit: 100, remaining: 10 }),
      baseState({ kind: 'voice_transcribe', used: 85, limit: 100, remaining: 15 }),
    ];
    expect(nearLimitWarning(states)).toBe('near-limit; bucket=report_generate; pct=90');
  });

  it('skips unbounded (limit=null) buckets', () => {
    const states = [
      baseState({ kind: 'ai_input_tokens', used: 999_999, limit: null, remaining: null }),
    ];
    expect(nearLimitWarning(states)).toBeNull();
  });

  it('caps reported percent at 100 even if used > limit', () => {
    const states = [
      baseState({ kind: 'ai_output_tokens', used: 200, limit: 100, remaining: 0 }),
    ];
    expect(nearLimitWarning(states)).toBe('near-limit; bucket=ai_output_tokens; pct=100');
  });
});
