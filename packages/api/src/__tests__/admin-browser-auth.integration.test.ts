import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { getPool, resetPool } from '../db/client.js';
import { startPg, type PgFixture } from './setup-pg.js';

const ADMIN_ORIGIN = 'http://localhost:3002';
let fx: PgFixture;

async function readOtp(email: string): Promise<string> {
  const result = await getPool().query<{ value: string }>(
    `SELECT value
     FROM public.verification
     WHERE identifier = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [`sign-in-otp-${email}`],
  );
  const value = result.rows[0]?.value;
  if (!value) throw new Error(`no OTP found for ${email}`);
  return value.split(':')[0]!;
}

function cookieHeader(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) throw new Error('auth response did not set a cookie');
  return setCookie
    .split(/,(?=[^;,]+=)/)
    .map((cookie) => cookie.split(';')[0]!)
    .join('; ');
}

beforeAll(async () => {
  process.env.EMAIL_OTP_LIVE = '0';
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('admin browser authentication and CORS', () => {
  it('allows credentialed preflights only from the configured admin origin', async () => {
    const app = createApp();
    const adminPreflight = await app.request('/admin/activity', {
      method: 'OPTIONS',
      headers: {
        origin: ADMIN_ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(adminPreflight.status).toBeGreaterThanOrEqual(200);
    expect(adminPreflight.status).toBeLessThan(300);
    expect(adminPreflight.headers.get('access-control-allow-origin')).toBe(ADMIN_ORIGIN);
    expect(adminPreflight.headers.get('access-control-allow-credentials')).toBe('true');
    expect(adminPreflight.headers.get('access-control-allow-methods')).toMatch(/GET/);

    const authPreflight = await app.request('/api/auth/sign-in/email-otp', {
      method: 'OPTIONS',
      headers: {
        origin: ADMIN_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(authPreflight.headers.get('access-control-allow-origin')).toBe(ADMIN_ORIGIN);
    expect(authPreflight.headers.get('access-control-allow-credentials')).toBe('true');
    expect(authPreflight.headers.get('access-control-allow-methods')).toMatch(/POST/);

    const rejected = await app.request('/admin/activity', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.example.com',
        'access-control-request-method': 'GET',
      },
    });
    expect(rejected.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('authenticates an admin activity request with the Better Auth cookie', async () => {
    const email = 'cookie-admin@example.com';
    const app = createApp();
    const send = await app.request('/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: ADMIN_ORIGIN,
      },
      body: JSON.stringify({ email, type: 'sign-in' }),
    });
    expect(send.status).toBe(200);

    const verify = await app.request('/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: ADMIN_ORIGIN,
      },
      body: JSON.stringify({ email, otp: await readOtp(email) }),
    });
    expect(verify.status).toBe(200);
    const body = (await verify.json()) as { user: { id: string } };
    await getPool().query(`UPDATE public."user" SET is_admin = true WHERE id = $1`, [body.user.id]);

    const activity = await app.request('/admin/activity', {
      headers: {
        cookie: cookieHeader(verify),
        origin: ADMIN_ORIGIN,
      },
    });
    expect(activity.status).toBe(200);
    expect(activity.headers.get('access-control-allow-origin')).toBe(ADMIN_ORIGIN);
    expect(activity.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('does not add admin CORS headers to unrelated routes', async () => {
    const response = await createApp().request('/healthz', {
      headers: { origin: ADMIN_ORIGIN },
    });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });
});
