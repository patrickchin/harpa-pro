/**
 * Unit test for withAnalytics middleware. Asserts that the client +
 * flag source + distinctId derivation works for all three caller
 * shapes (authed user, X-Device-Id header, anonymous fallback).
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv } from '../app.js';
import { withAnalytics } from './analytics.js';
import { noopAnalyticsClient } from '../lib/posthog.js';
import { InMemoryFlagSource } from '../lib/flags.js';

function makeApp() {
  const analytics = noopAnalyticsClient();
  const flags = new InMemoryFlagSource();
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    // Simulate withAuth populating userId for protected routes
    const sub = c.req.header('x-test-user-id');
    if (sub) c.set('userId', sub);
    await next();
  });
  app.use('*', withAnalytics({ analytics, flags }));
  app.get('/ctx', (c) =>
    c.json({
      distinctId: c.get('distinctId'),
      hasAnalytics: !!c.get('analytics'),
      hasFlags: !!c.get('flags'),
    }),
  );
  return app;
}

describe('withAnalytics', () => {
  it('uses userId as distinctId when authed', async () => {
    const app = makeApp();
    const res = await app.request('/ctx', { headers: { 'x-test-user-id': 'user_alice' } });
    const body = (await res.json()) as { distinctId: string; hasAnalytics: boolean; hasFlags: boolean };
    expect(body.distinctId).toBe('user_alice');
    expect(body.hasAnalytics).toBe(true);
    expect(body.hasFlags).toBe(true);
  });

  it('falls back to X-Device-Id header for unauthed routes', async () => {
    const app = makeApp();
    const res = await app.request('/ctx', { headers: { 'x-device-id': 'dev_123' } });
    const body = (await res.json()) as { distinctId: string };
    expect(body.distinctId).toBe('dev_123');
  });

  it('falls back to "anonymous" when neither is present', async () => {
    const app = makeApp();
    const res = await app.request('/ctx');
    const body = (await res.json()) as { distinctId: string };
    expect(body.distinctId).toBe('anonymous');
  });

  it('prefers authed userId over X-Device-Id header', async () => {
    const app = makeApp();
    const res = await app.request('/ctx', {
      headers: { 'x-test-user-id': 'user_alice', 'x-device-id': 'dev_123' },
    });
    const body = (await res.json()) as { distinctId: string };
    expect(body.distinctId).toBe('user_alice');
  });
});
