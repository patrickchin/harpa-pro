import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { auth } from '../auth/auth.js';
import { getPool, resetPool } from '../db/client.js';
import { startPg, type PgFixture } from './setup-pg.js';

let fx: PgFixture;

async function sendOtp(email: string): Promise<void> {
  const response = await createApp().request('/api/auth/email-otp/send-verification-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, type: 'sign-in' }),
  });
  expect(response.status).toBe(200);
}

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

async function signIn(email: string, requestId?: string): Promise<Response> {
  const otp = await readOtp(email);
  return createApp().request('/api/auth/sign-in/email-otp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(requestId ? { 'x-request-id': requestId } : {}),
    },
    body: JSON.stringify({ email, otp }),
  });
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

beforeEach(async () => {
  const pool = getPool();
  await pool.query(`DELETE FROM public.session`);
  await pool.query(`DELETE FROM public.account`);
  await pool.query(`DELETE FROM public.verification`);
  await pool.query(`DELETE FROM public."user"`);
  await pool.query(`DELETE FROM app.activity_events`);
});

describe('signup activity', () => {
  it('records one event for the first real email-OTP sign-in', async () => {
    const email = 'new-person@example.com';

    await sendOtp(email);
    const first = await signIn(email, 'signup-request-123');
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { user: { id: string } };

    await sendOtp(email);
    const second = await signIn(email);
    expect(second.status).toBe(200);

    const events = await getPool().query<{
      event_type: string;
      actor_user_id: string;
      subject_id: string;
      request_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      `SELECT event_type, actor_user_id, subject_id, request_id, metadata
       FROM app.activity_events
       WHERE dedupe_key = $1`,
      [`user.signed_up:${firstBody.user.id}`],
    );

    expect(events.rows).toEqual([
      {
        event_type: 'user.signed_up',
        actor_user_id: firstBody.user.id,
        subject_id: firstBody.user.id,
        request_id: 'signup-request-123',
        metadata: { method: 'email_otp' },
      },
    ]);
  });

  it('does not classify an internally seeded account as a signup', async () => {
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.createUser({
      email: 'seeded@example.com',
      name: 'Seeded account',
      emailVerified: true,
    });
    expect(user?.id).toBeTruthy();

    const events = await getPool().query(
      `SELECT id
       FROM app.activity_events
       WHERE dedupe_key = $1`,
      [`user.signed_up:${user!.id}`],
    );
    expect(events.rowCount).toBe(0);
  });
});
