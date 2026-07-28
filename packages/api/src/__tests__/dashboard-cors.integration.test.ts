/**
 * Browser dashboard CORS and better-auth default-wiring coverage.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { getPool, resetPool } from '../db/client.js';
import { startPg, type PgFixture } from './setup-pg.js';

let fx: PgFixture;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('dashboard browser origin wiring', () => {
  it('allows credentialed preflight with dashboard request headers', async () => {
    const res = await createApp().request('/projects', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://app.harpapro.com',
        'access-control-request-method': 'GET',
        'access-control-request-headers':
          'authorization,content-type,idempotency-key',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://app.harpapro.com',
    );
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    expect(res.headers.get('access-control-allow-methods') ?? '').toMatch(
      /GET/,
    );
    expect(res.headers.get('access-control-allow-headers') ?? '').toMatch(
      /authorization/i,
    );
    expect(res.headers.get('access-control-allow-headers') ?? '').toMatch(
      /idempotency-key/i,
    );
  });

  it('adds credentialed CORS headers to an authenticated-route response', async () => {
    const res = await createApp().request('/projects', {
      headers: { origin: 'https://app.harpapro.com' },
    });

    expect(res.status).toBe(401);
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://app.harpapro.com',
    );
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('allows the local dashboard origin through real email-OTP wiring', async () => {
    const res = await createApp().request(
      '/api/auth/email-otp/send-verification-otp',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:5173',
        },
        body: JSON.stringify({
          email: 'dashboard-auth@test.local',
          type: 'sign-in',
        }),
      },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:5173',
    );
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('does not emit dashboard CORS headers for an unknown origin', async () => {
    const res = await createApp().request('/projects', {
      headers: { origin: 'https://evil.example.com' },
    });

    expect(res.status).toBe(401);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });
});
