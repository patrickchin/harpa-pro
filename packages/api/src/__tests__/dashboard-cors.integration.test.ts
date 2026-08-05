/**
 * Browser dashboard CORS and better-auth default-wiring coverage.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { getPool, resetPool } from '../db/client.js';
import { startPg, type PgFixture } from './setup-pg.js';

let fx: PgFixture;

async function readLatestOtp(email: string): Promise<string> {
  const result = await getPool().query<{ value: string }>(
    `SELECT value
       FROM public.verification
      WHERE identifier = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [`sign-in-otp-${email}`],
  );
  const value = result.rows[0]?.value;
  if (!value) throw new Error(`no OTP row for ${email}`);
  return value.split(':')[0]!;
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
          origin: 'http://localhost:3003',
        },
        body: JSON.stringify({
          email: 'dashboard-auth@test.local',
          type: 'sign-in',
        }),
      },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:3003',
    );
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('allows the loopback origin used by dashboard Playwright', async () => {
    const res = await createApp().request('/projects', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://127.0.0.1:3003',
        'access-control-request-method': 'GET',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'http://127.0.0.1:3003',
    );
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('carries a real email-OTP browser cookie into an authenticated route', async () => {
    const app = createApp();
    const origin = 'https://auth-check.harpa-pro-dashboard.pages.dev';
    const email = 'dashboard-cookie@test.local';
    const send = await app.request(
      '/api/auth/email-otp/send-verification-otp',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({ email, type: 'sign-in' }),
      },
    );
    expect(send.status).toBe(200);

    const verify = await app.request('/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ email, otp: await readLatestOtp(email) }),
    });
    expect(verify.status).toBe(200);
    const setCookie = verify.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    const sessionCookie = setCookie?.split(';', 1)[0];
    expect(sessionCookie).toMatch(/session_token=/);

    const me = await app.request('/me', {
      headers: { cookie: sessionCookie ?? '', origin },
    });
    expect(me.status).toBe(200);
    expect(me.headers.get('access-control-allow-origin')).toBe(origin);
    expect(me.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('allows an immutable Cloudflare Pages preview origin', async () => {
    const res = await createApp().request('/projects', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://a1b2c3.harpa-pro-dashboard.pages.dev',
        'access-control-request-method': 'GET',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://a1b2c3.harpa-pro-dashboard.pages.dev',
    );
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('allows the canonical Cloudflare Pages project origin', async () => {
    const origin = 'https://harpa-pro-dashboard.pages.dev';
    const res = await createApp().request('/projects', {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'GET',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(origin);
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
