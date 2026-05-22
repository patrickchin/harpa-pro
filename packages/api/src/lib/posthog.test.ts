/**
 * Unit tests for the PostHog client factory. The default-wiring
 * integration test (Pitfall 13) lives in
 * src/__tests__/posthog.integration.test.ts and exercises the real
 * PostHog client against a captured-request HTTP server.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createAnalyticsClient,
  noopAnalyticsClient,
  __resetAnalyticsClientForTests,
  getAnalyticsClient,
} from './posthog.js';

describe('createAnalyticsClient', () => {
  beforeEach(() => {
    __resetAnalyticsClientForTests();
  });

  it('returns a stub when no apiKey is supplied', () => {
    const c = createAnalyticsClient({ forceStub: true });
    expect(c.isStub()).toBe(true);
  });

  it('returns a stub in test env even with apiKey present', () => {
    // NODE_ENV=test in vitest by default
    const c = createAnalyticsClient({ apiKey: 'phc_fake' });
    expect(c.isStub()).toBe(true);
  });

  it('stub capture/identify/shutdown are no-ops and do not throw', async () => {
    const c = noopAnalyticsClient();
    expect(() => c.capture({ distinctId: 'u', event: 'app_opened' as never })).not.toThrow();
    expect(() => c.identify({ distinctId: 'u' })).not.toThrow();
    await expect(c.shutdown()).resolves.toBeUndefined();
  });

  it('getAnalyticsClient memoises the singleton', () => {
    const a = getAnalyticsClient();
    const b = getAnalyticsClient();
    expect(a).toBe(b);
  });
});
