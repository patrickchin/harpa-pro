/**
 * CORS integration tests for /waitlist + /waitlist/confirm (M1.8).
 *
 * The cross-origin call from https://harpapro.com → https://api.harpapro.com
 * is what makes the marketing form work without a server-side proxy. The
 * allowlist comes from `WAITLIST_CORS_ORIGINS`; everything else must be
 * blocked (no `Access-Control-Allow-Origin` returned).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { startPg, type PgFixture } from './setup-pg.js';
import { createApp } from '../app.js';
import { rawDb, resetPool, getPool } from '../db/client.js';
import { resetRateLimiter } from '../lib/rateLimiter.js';
import { setWaitlistClients, resetWaitlistClients } from '../routes/waitlist.js';
import { resetFakeResendSends } from '../lib/resend.js';
import type { TurnstileClient } from '../lib/turnstile.js';

let fx: PgFixture;

function alwaysOkTurnstile(): TurnstileClient {
  return { async verify() { return { success: true }; } };
}

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

beforeEach(async () => {
  resetRateLimiter();
  resetWaitlistClients();
  resetFakeResendSends();
  setWaitlistClients({ turnstile: alwaysOkTurnstile() });
  await rawDb().execute(sql`TRUNCATE app.waitlist_signups`);
});

describe('CORS for /waitlist', () => {
  it('preflight from https://harpapro.com is allowed (POST + Content-Type)', async () => {
    const app = createApp();
    const res = await app.request('/waitlist', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://harpapro.com',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://harpapro.com');
    expect(res.headers.get('access-control-allow-methods') ?? '').toMatch(/POST/);
    expect(res.headers.get('access-control-allow-headers') ?? '').toMatch(/content-type/i);
  });

  it('preflight from localhost:3002 (dev) is allowed', async () => {
    const app = createApp();
    const res = await app.request('/waitlist', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:3002',
        'access-control-request-method': 'POST',
      },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3002');
  });

  it('preflight from an unknown origin is blocked', async () => {
    const app = createApp();
    const res = await app.request('/waitlist', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.example.com',
        'access-control-request-method': 'POST',
      },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('actual POST from allowed origin includes ACAO header in the response', async () => {
    const app = createApp();
    const res = await app.request('/waitlist', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://harpapro.com',
      },
      body: JSON.stringify({ email: 'cors@buildco.com', turnstileToken: 'tt-ok' }),
    });
    expect(res.status).toBe(202);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://harpapro.com');
  });

  it('CORS applies to /waitlist/confirm too', async () => {
    const app = createApp();
    const res = await app.request('/waitlist/confirm', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://harpapro.com',
        'access-control-request-method': 'POST',
      },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://harpapro.com');
  });

  it('CORS does NOT apply to other routes (e.g. /healthz)', async () => {
    const app = createApp();
    const res = await app.request('/healthz', {
      headers: { origin: 'https://harpapro.com' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
