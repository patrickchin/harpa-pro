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
import { _resetPasswordBypassForTest } from '../auth/password.js';
import { resetRateLimiter } from '../lib/rateLimiter.js';

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

describe('Test-account password bypass', () => {
  const TEST_PHONE = '+15550199001';
  const OTHER_PHONE = '+15550199002';
  const PASSWORD = 'correct-horse-battery-staple';

  beforeAll(() => {
    process.env.TEST_ACCOUNT_PHONES = `${TEST_PHONE},+15550199009`;
    process.env.TEST_ACCOUNT_PASSWORD = PASSWORD;
    _resetPasswordBypassForTest();
    resetRateLimiter();
  });

  afterAll(() => {
    delete process.env.TEST_ACCOUNT_PHONES;
    delete process.env.TEST_ACCOUNT_PASSWORD;
    _resetPasswordBypassForTest();
    resetRateLimiter();
  });

  it('happy path: allow-listed phone + correct password mints a token and upserts the user', async () => {
    const app = createApp();
    const res = await app.request('/auth/password/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: TEST_PHONE, password: PASSWORD }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      user: { id: string; phone: string };
    };
    expect(body.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(body.user.phone).toBe(TEST_PHONE);

    // User + session rows persisted, just like the OTP path.
    const pool = getPool();
    const conn = await pool.connect();
    try {
      const userRows = await conn.query<{ id: string }>(
        `SELECT id FROM auth.users WHERE phone = $1`,
        [TEST_PHONE],
      );
      expect(userRows.rows[0]?.id).toBe(body.user.id);
      const sessRows = await conn.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM auth.sessions WHERE user_id = $1`,
        [body.user.id],
      );
      expect(Number(sessRows.rows[0]?.count)).toBeGreaterThanOrEqual(1);
    } finally {
      conn.release();
    }

    // Bearer works on /me — proves the issued JWT is valid end-to-end.
    const meRes = await app.request('/me', {
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(meRes.status).toBe(200);
  });

  it('rejects wrong password with 401', async () => {
    const app = createApp();
    const res = await app.request('/auth/password/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: TEST_PHONE, password: 'wrong-password-zzzzzz' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects non-allow-listed phone with 401 (same shape as wrong password — no enumeration)', async () => {
    const app = createApp();
    const res = await app.request('/auth/password/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: OTHER_PHONE, password: PASSWORD }),
    });
    expect(res.status).toBe(401);
  });
});

describe('Test-account password bypass — disabled', () => {
  beforeAll(() => {
    delete process.env.TEST_ACCOUNT_PHONES;
    delete process.env.TEST_ACCOUNT_PASSWORD;
    _resetPasswordBypassForTest();
  });

  it('returns 404 when feature env vars are unset', async () => {
    const app = createApp();
    const res = await app.request('/auth/password/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '+15550100400', password: 'anything-long-enough' }),
    });
    expect(res.status).toBe(404);
  });
});
