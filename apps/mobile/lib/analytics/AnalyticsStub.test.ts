import { describe, it, expect, vi } from 'vitest';

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));

import { useFeatureFlag, analyticsConfigured } from './AnalyticsStub';
import { BOOLEAN_FLAGS, VARIANT_FLAGS, FLAG_FAILSAFE_DEFAULTS } from '@harpa/analytics-events';

describe('useFeatureFlag (stub)', () => {
  it('returns the failsafe default for boolean flags', () => {
    expect(useFeatureFlag(BOOLEAN_FLAGS.TWILIO_LIVE)).toBe(
      FLAG_FAILSAFE_DEFAULTS[BOOLEAN_FLAGS.TWILIO_LIVE],
    );
    expect(useFeatureFlag(BOOLEAN_FLAGS.AI_LIVE)).toBe(false);
  });

  it('returns the failsafe variant for multivariate flags', () => {
    expect(useFeatureFlag(VARIANT_FLAGS.AI_FIXTURE_MODE, 'replay')).toBe(
      FLAG_FAILSAFE_DEFAULTS[VARIANT_FLAGS.AI_FIXTURE_MODE],
    );
  });
});

describe('analyticsConfigured', () => {
  it('is false in fixture/test runs (EXPO_PUBLIC_POSTHOG_KEY unset)', () => {
    // env reads happen at module load; in the test env POSTHOG_KEY is unset.
    expect(analyticsConfigured()).toBe(false);
  });
});
