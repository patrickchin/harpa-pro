import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PgFixture } from './setup-pg.js';

const REVIEW_EMAIL = 'app-review+testhash@harpapro.com';
const REVIEW_CODE = '123456789012';

let fx: PgFixture;
let createApp: typeof import('../app.js').createApp;
let getPool: typeof import('../db/client.js').getPool;
let resetPool: typeof import('../db/client.js').resetPool;

async function readLatestOtp(email: string): Promise<string> {
  return String((await readLatestVerificationValue(email)).split(':')[0]!);
}

async function readLatestVerificationValue(email: string): Promise<string> {
  const pool = getPool();
  const r = await pool.query<{ value: string }>(
    `SELECT value
       FROM public.verification
      WHERE identifier = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [`sign-in-otp-${email.toLowerCase()}`],
  );
  if (r.rows.length === 0) throw new Error(`no OTP row for ${email}`);
  return String(r.rows[0]!.value);
}

async function signInEmailOtp(
  app: ReturnType<typeof createApp>,
  email: string,
  otp: string,
): Promise<Response> {
  return app.request('/api/auth/sign-in/email-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  });
}

async function sendSignInOtp(app: ReturnType<typeof createApp>, email: string): Promise<Response> {
  return app.request('/api/auth/email-otp/send-verification-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, type: 'sign-in' }),
  });
}

beforeAll(async () => {
  process.env.APP_REVIEW_EMAIL = REVIEW_EMAIL;
  process.env.APP_REVIEW_CODE = REVIEW_CODE;
  process.env.EMAIL_OTP_LIVE = '0';

  vi.resetModules();
  const setupPg = await import('./setup-pg.js');
  const dbClient = await import('../db/client.js');
  getPool = dbClient.getPool;
  resetPool = dbClient.resetPool;

  fx = await setupPg.startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
  ({ createApp } = await import('../app.js'));
}, 120_000);

afterAll(async () => {
  delete process.env.APP_REVIEW_EMAIL;
  delete process.env.APP_REVIEW_CODE;
  await fx?.stop();
}, 60_000);

beforeEach(async () => {
  const pool = getPool();
  await pool.query(`DELETE FROM public.session`);
  await pool.query(`DELETE FROM public.account`);
  await pool.query(`DELETE FROM public.verification`);
  await pool.query(`DELETE FROM public."user"`);
});

describe('App Review email-OTP access', () => {
  it('signs in the configured review email with the correct 12-digit code', async () => {
    const app = createApp();
    const sendRes = await sendSignInOtp(app, REVIEW_EMAIL);
    expect(sendRes.status).toBe(200);

    const res = await signInEmailOtp(app, REVIEW_EMAIL, REVIEW_CODE);

    expect(res.status).toBe(200);
    expect(res.headers.get('set-auth-token')).toBeTruthy();
    const body = (await res.json()) as { token: string; user: { email: string } };
    expect(body.token).toBeTruthy();
    expect(body.user.email).toBe(REVIEW_EMAIL);

    const me = await app.request('/me', {
      headers: { authorization: `Bearer ${res.headers.get('set-auth-token')}` },
    });
    expect(me.status).toBe(200);
  });

  it('stores the configured review code hashed, not plaintext', async () => {
    const app = createApp();
    const sendRes = await sendSignInOtp(app, REVIEW_EMAIL);
    expect(sendRes.status).toBe(200);

    const storedValue = await readLatestVerificationValue(REVIEW_EMAIL);
    const [storedOtp, attempts] = storedValue.split(':');
    expect(storedOtp).not.toBe(REVIEW_CODE);
    expect(storedOtp).toMatch(/^[a-f0-9]{64}$/);
    expect(attempts).toBe('0');
  });

  it('rejects the review code for any other email', async () => {
    const app = createApp();
    const sendRes = await sendSignInOtp(app, 'not-review@example.com');
    expect(sendRes.status).toBe(200);

    const res = await signInEmailOtp(app, 'not-review@example.com', REVIEW_CODE);

    expect(res.status).not.toBe(200);
    expect(res.headers.get('set-auth-token')).toBeNull();
  });

  it('rejects the review email with a wrong 12-digit code', async () => {
    const app = createApp();
    const sendRes = await sendSignInOtp(app, REVIEW_EMAIL);
    expect(sendRes.status).toBe(200);

    const res = await signInEmailOtp(app, REVIEW_EMAIL, '999999999999');

    expect(res.status).not.toBe(200);
    expect(res.headers.get('set-auth-token')).toBeNull();
  });

  it('rejects a normal user with a random 12-digit code', async () => {
    const app = createApp();
    const sendRes = await sendSignInOtp(app, 'alice@example.com');
    expect(sendRes.status).toBe(200);

    const res = await signInEmailOtp(app, 'alice@example.com', '222222222222');

    expect(res.status).not.toBe(200);
    expect(res.headers.get('set-auth-token')).toBeNull();
  });

  it('still signs in normal users with a six-digit email OTP', async () => {
    const app = createApp();
    const email = 'alice@example.com';

    const sendRes = await sendSignInOtp(app, email);
    expect(sendRes.status).toBe(200);

    const otp = await readLatestOtp(email);
    expect(otp).toMatch(/^\d{6}$/);

    const verifyRes = await signInEmailOtp(app, email, otp);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.headers.get('set-auth-token')).toBeTruthy();
  });
});
