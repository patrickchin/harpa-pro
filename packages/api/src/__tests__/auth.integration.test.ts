/**
 * P0.4 — OTP round-trip integration test.
 *
 * Boots Postgres in Testcontainers, runs migrations, then exercises:
 *   POST /auth/otp/start  →  POST /auth/otp/verify  →  GET /me
 * using the Twilio fake-mode (TWILIO_LIVE=0 + TWILIO_VERIFY_FAKE_CODE).
 *
 * No external network calls. No real Twilio.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../app.js';
import { startPg, type PgFixture } from './setup-pg.js';
import { resetPool, getPool } from '../db/client.js';

let fx: PgFixture;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url); // prime the pool with the testcontainer URL
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('OTP auth flow', () => {
  it('start → verify → /me round trip mints a JWT and resolves the user', async () => {
    const app = createApp();
    const phone = '+15550100100';

    // 1. start
    const startRes = await app.request('/auth/otp/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    expect(startRes.status).toBe(200);
    const startBody = (await startRes.json()) as { verificationId: string };
    expect(startBody.verificationId).toMatch(/fake-/);

    // 2. verify with the configured fake code (default 000000)
    const verifyRes = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, code: '000000' }),
    });
    expect(verifyRes.status).toBe(200);
    const verifyBody = (await verifyRes.json()) as {
      token: string;
      user: { id: string; phone: string };
    };
    expect(verifyBody.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(verifyBody.user.phone).toBe(phone);

    // 3. /me with the issued bearer
    const meRes = await app.request('/me', {
      headers: { authorization: `Bearer ${verifyBody.token}` },
    });
    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as { user: { id: string; phone: string } };
    expect(meBody.user.id).toBe(verifyBody.user.id);
    expect(meBody.user.phone).toBe(phone);
  });

  it('rejects an invalid OTP code', async () => {
    const app = createApp();
    const phone = '+15550100200';

    const startRes = await app.request('/auth/otp/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    expect(startRes.status).toBe(200);

    const verifyRes = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, code: '999999' }),
    });
    expect(verifyRes.status).toBe(401);
  });

  it('/me rejects requests without a bearer token', async () => {
    const app = createApp();
    const res = await app.request('/me');
    expect(res.status).toBe(401);
  });

  it('logout deletes the session row', async () => {
    const app = createApp();
    const phone = '+15550100300';

    await app.request('/auth/otp/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const verifyRes = await app.request('/auth/otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, code: '000000' }),
    });
    const { token } = (await verifyRes.json()) as { token: string };

    const logoutRes = await app.request('/auth/logout', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logoutRes.status).toBe(200);

    // Session row gone — verify directly against the DB.
    const pool = getPool();
    const conn = await pool.connect();
    try {
      const rows = await conn.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM auth.sessions WHERE user_id = (SELECT id FROM auth.users WHERE phone = $1)`,
        [phone],
      );
      expect(rows.rows[0]?.count).toBe('0');
    } finally {
      conn.release();
    }
  });
});
