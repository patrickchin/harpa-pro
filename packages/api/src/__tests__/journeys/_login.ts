/**
 * Shared journey helpers.
 *
 * These deliberately do NOT use `signTestSession`. Every token comes from a
 * real POST /api/auth/email-otp/send-verification-otp → /api/auth/email-otp/verify-otp
 * round-trip through the fake-email path (EMAIL_OTP_LIVE=0). That makes the
 * journey suite the executable spec for the auth issuance path — if
 * `signTestSession`'s claim shape drifts from the real issuer, journey tests
 * will fail loudly while per-resource integration tests would not.
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

/**
 * Real email-OTP login. Returns a fresh user the first time `email` is seen,
 * then re-issues a token for the same user on subsequent calls.
 *
 * In fake mode (EMAIL_OTP_LIVE=0), the OTP is persisted to public.verification
 * but not sent. POST /api/dev/last-otp reads it back from the DB.
 */
export async function login(app: App, email: string): Promise<LoggedIn> {
  const sendRes = await app.request('/api/auth/email-otp/send-verification-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (sendRes.status !== 200) {
    throw new Error(`send-verification-otp failed: ${sendRes.status} ${await sendRes.text()}`);
  }

  const otpRes = await app.request('/api/dev/last-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (otpRes.status !== 200) {
    throw new Error(`last-otp lookup failed: ${otpRes.status} ${await otpRes.text()}`);
  }
  const { otp } = (await otpRes.json()) as { otp: string };

  const verifyRes = await app.request('/api/auth/email-otp/verify-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  });
  if (verifyRes.status !== 200) {
    throw new Error(`verify-otp failed: ${verifyRes.status} ${await verifyRes.text()}`);
  }
  const body = (await verifyRes.json()) as { token: string; user: { id: string; email: string } };
  return {
    token: body.token,
    userId: body.user.id,
    email: body.user.email,
    headers: { authorization: `Bearer ${body.token}`, 'content-type': 'application/json' },
  };
}

