/**
 * Shared journey helpers.
 *
 * These deliberately do NOT use `signTestToken`. Every token comes from a
 * real POST /auth/otp/start → /auth/otp/verify round-trip through the
 * fake-Twilio path (TWILIO_LIVE=0, TWILIO_VERIFY_FAKE_CODE=000000). That
 * makes the journey suite the executable spec for the auth issuance path —
 * if `signTestToken`'s claim shape drifts from the real issuer, journey
 * tests will fail loudly while per-resource integration tests would not.
 */
import { startPg, type PgFixture } from '../setup-pg.js';
import { resetPool, getPool } from '../../db/client.js';
import type { createApp } from '../../app.js';

type App = ReturnType<typeof createApp>;

export const FAKE_CODE = '000000';

export interface JourneyFixture {
  fx: PgFixture;
}

export async function bootJourneyPg(): Promise<JourneyFixture> {
  process.env.TWILIO_LIVE = '0';
  process.env.TWILIO_VERIFY_FAKE_CODE = FAKE_CODE;
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
  phone: string;
  headers: Record<string, string>;
}

/**
 * Real OTP login. Returns a fresh user the first time `phone` is seen,
 * then re-issues a token for the same user on subsequent calls.
 */
export async function login(app: App, phone: string): Promise<LoggedIn> {
  const startRes = await app.request('/auth/otp/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (startRes.status !== 200) {
    throw new Error(`otp/start failed: ${startRes.status} ${await startRes.text()}`);
  }
  const verifyRes = await app.request('/auth/otp/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, code: FAKE_CODE }),
  });
  if (verifyRes.status !== 200) {
    throw new Error(`otp/verify failed: ${verifyRes.status} ${await verifyRes.text()}`);
  }
  const body = (await verifyRes.json()) as { token: string; user: { id: string; phone: string } };
  return {
    token: body.token,
    userId: body.user.id,
    phone: body.user.phone,
    headers: { authorization: `Bearer ${body.token}`, 'content-type': 'application/json' },
  };
}
