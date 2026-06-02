/**
 * Shared journey helpers.
 *
 * Real login through better-auth's email-OTP plugin: POST
 * `/api/auth/email-otp/send-verification-otp` then read the OTP from
 * the `verification` table and POST it to
 * `/api/auth/sign-in/email-otp`. The bearer token returned in the
 * `set-auth-token` response header (better-auth's `bearer()` plugin) is
 * used for subsequent requests.
 */
import { startPg, type PgFixture } from '../setup-pg.js';
import { resetPool, getPool } from '../../db/client.js';
import type { createApp } from '../../app.js';

type App = ReturnType<typeof createApp>;

export interface JourneyFixture {
  fx: PgFixture;
}

export async function bootJourneyPg(): Promise<JourneyFixture> {
  process.env.EMAIL_OTP_LIVE = '0';
  process.env.R2_FIXTURE_MODE = 'replay';
  const fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
  return { fx };
}

export async function teardownJourneyPg(j: JourneyFixture | undefined) {
  await j?.fx?.stop();
}

export interface LoggedIn {
  token: string;
  userId: string;
  email: string;
  headers: Record<string, string>;
}

function toEmail(identifier: string): string {
  if (identifier.includes('@')) return identifier.toLowerCase();
  const slug = identifier.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'user';
  return `${slug}@test.local`;
}

async function readLatestOtp(email: string): Promise<string> {
  const pool = getPool();
  const r = await pool.query<{ value: string }>(
    `SELECT value FROM "verification" WHERE identifier LIKE $1 ORDER BY created_at DESC LIMIT 1`,
    [`%${email}%`],
  );
  if (r.rows.length === 0) throw new Error(`no verification row for ${email}`);
  const v = String(r.rows[0]!.value);
  return v.split(':')[0]!;
}

/**
 * Real OTP login via better-auth. Accepts an identifier (phone-like
 * string, plain slug, or email) and derives a stable email.
 */
export async function login(app: App, identifier: string): Promise<LoggedIn> {
  const email = toEmail(identifier);
  const sendRes = await app.request('/api/auth/email-otp/send-verification-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, type: 'sign-in' }),
  });
  if (sendRes.status !== 200) {
    throw new Error(`send-verification-otp failed: ${sendRes.status} ${await sendRes.text()}`);
  }
  const otp = await readLatestOtp(email);
  const verifyRes = await app.request('/api/auth/sign-in/email-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  });
  if (verifyRes.status !== 200) {
    throw new Error(`sign-in/email-otp failed: ${verifyRes.status} ${await verifyRes.text()}`);
  }
  const token = verifyRes.headers.get('set-auth-token') ?? '';
  if (!token) throw new Error('no set-auth-token header on email-otp sign-in');
  const body = (await verifyRes.json()) as { user: { id: string; email: string } };
  return {
    token,
    userId: body.user.id,
    email: body.user.email,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  };
}

/**
 * Test-account password login via better-auth. Hits POST
 * `/api/auth/sign-in/email` with email + password; gated server-side
 * by the before-hook against TEST_ACCOUNT_EMAILS.
 */
export async function loginWithPassword(
  app: App,
  email: string,
  password: string,
): Promise<LoggedIn> {
  const res = await app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) {
    throw new Error(`sign-in/email failed: ${res.status} ${await res.text()}`);
  }
  const token = res.headers.get('set-auth-token') ?? '';
  if (!token) throw new Error('no set-auth-token header on password sign-in');
  const body = (await res.json()) as { user: { id: string; email: string } };
  return {
    token,
    userId: body.user.id,
    email: body.user.email,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  };
}

