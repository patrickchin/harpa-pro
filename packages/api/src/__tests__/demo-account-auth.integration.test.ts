import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PgFixture } from './setup-pg.js';

const DEMO_EMAIL = 'demo@harpapro.com';
const DEMO_EMAIL_2 = 'demo2@harpapro.com';
const DEMO_PASSWORD = 'demo-password-12345';

let fx: PgFixture;
let createApp: typeof import('../app.js').createApp;
let auth: typeof import('../auth/auth.js').auth;
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

async function signInPassword(
  app: ReturnType<typeof createApp>,
  email: string,
  password: string,
): Promise<Response> {
  return app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

async function sendSignInOtp(app: ReturnType<typeof createApp>, email: string): Promise<Response> {
  return app.request('/api/auth/email-otp/send-verification-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, type: 'sign-in' }),
  });
}

async function seedPasswordUser(email: string, password: string): Promise<void> {
  const ctx = await auth.$context;
  const passwordHash = await ctx.password.hash(password);
  const existing = await ctx.internalAdapter.findUserByEmail(email);
  const userId = existing?.user.id
    ?? (await ctx.internalAdapter.createUser({
      email,
      name: email,
      emailVerified: true,
    }))?.id;
  if (!userId) throw new Error(`unable to seed ${email}`);
  await ctx.internalAdapter.linkAccount({
    userId,
    providerId: 'credential',
    accountId: userId,
    password: passwordHash,
  });
}

beforeAll(async () => {
  process.env.DEMO_ACCOUNT_EMAILS = `${DEMO_EMAIL},${DEMO_EMAIL_2}`;
  process.env.DEMO_ACCOUNT_PASSWORD = DEMO_PASSWORD;
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
  ({ auth } = await import('../auth/auth.js'));
}, 120_000);

afterAll(async () => {
  delete process.env.DEMO_ACCOUNT_EMAILS;
  delete process.env.DEMO_ACCOUNT_PASSWORD;
  await fx?.stop();
}, 60_000);

beforeEach(async () => {
  const pool = getPool();
  await pool.query(`DELETE FROM public.session`);
  await pool.query(`DELETE FROM public.account`);
  await pool.query(`DELETE FROM public.verification`);
  await pool.query(`DELETE FROM public."user"`);
});

describe('Demo account password access', () => {
  it('signs in a configured demo email with the correct password', async () => {
    const app = createApp();
    await seedPasswordUser(DEMO_EMAIL, DEMO_PASSWORD);

    const res = await signInPassword(app, DEMO_EMAIL, DEMO_PASSWORD);

    expect(res.status).toBe(200);
    expect(res.headers.get('set-auth-token')).toBeTruthy();
    const body = (await res.json()) as { token: string; user: { email: string } };
    expect(body.token).toBeTruthy();
    expect(body.user.email).toBe(DEMO_EMAIL);

    const me = await app.request('/me', {
      headers: { authorization: `Bearer ${res.headers.get('set-auth-token')}` },
    });
    expect(me.status).toBe(200);
  });

  it('signs in a second configured demo email with the same password', async () => {
    const app = createApp();
    await seedPasswordUser(DEMO_EMAIL_2, DEMO_PASSWORD);

    const res = await signInPassword(app, DEMO_EMAIL_2, DEMO_PASSWORD);

    expect(res.status).toBe(200);
    expect(res.headers.get('set-auth-token')).toBeTruthy();
  });

  it('rejects the demo password for any other email even if that account exists', async () => {
    const app = createApp();
    await seedPasswordUser('not-demo@example.com', DEMO_PASSWORD);

    const res = await signInPassword(app, 'not-demo@example.com', DEMO_PASSWORD);

    expect(res.status).not.toBe(200);
    expect(res.headers.get('set-auth-token')).toBeNull();
  });

  it('rejects a demo email with a wrong password', async () => {
    const app = createApp();
    await seedPasswordUser(DEMO_EMAIL, DEMO_PASSWORD);

    const res = await signInPassword(app, DEMO_EMAIL, 'wrong-password-12345');

    expect(res.status).not.toBe(200);
    expect(res.headers.get('set-auth-token')).toBeNull();
  });

  it('leaves the email OTP route on normal 6-digit OTP behavior', async () => {
    const app = createApp();
    const sendRes = await sendSignInOtp(app, DEMO_EMAIL);
    expect(sendRes.status).toBe(200);

    const otp = await readLatestOtp(DEMO_EMAIL);
    expect(otp).toMatch(/^\d{6}$/);
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
