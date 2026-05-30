/**
 * Password-login journey: TWILIO_LIVE=1 + test-account password bypass.
 *
 * Mirrors `auth-crud.journey.integration.test.ts` but logs in via
 * `POST /auth/password/verify` instead of OTP, and crucially boots
 * the API with `TWILIO_LIVE=1` to prove the bypass works on a live
 * deployment configuration — i.e. we don't need to flip TWILIO_LIVE
 * back to 0 or rely on the fake-code shortcut to smoke-test against
 * `harpa-pro-api-dev`.
 *
 * No Twilio calls happen because the password route never touches
 * the Twilio client. If a regression accidentally routes through
 * Twilio with TWILIO_LIVE=1 and no creds, the test fails loudly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../app.js';
import { startPg, type PgFixture } from '../setup-pg.js';
import { resetPool, getPool } from '../../db/client.js';
import { loginWithPassword } from './_login.js';
import { _resetPasswordBypassForTest } from '../../auth/password.js';
import { resetRateLimiter } from '../../lib/rateLimiter.js';

const TEST_PHONE = '+15550199801';
const TEST_PASSWORD = 'journey-test-password-1234';

let fx: PgFixture;

beforeAll(async () => {
  process.env.TWILIO_LIVE = '1';
  // Intentionally omit TWILIO_VERIFY_FAKE_CODE — if the password path
  // ever falls back to Twilio fake mode, that should be a hard failure.
  delete process.env.TWILIO_VERIFY_FAKE_CODE;
  process.env.TEST_ACCOUNT_PHONES = TEST_PHONE;
  process.env.TEST_ACCOUNT_PASSWORD = TEST_PASSWORD;
  process.env.R2_FIXTURE_MODE = 'replay';
  _resetPasswordBypassForTest();
  resetRateLimiter();
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
}, 240_000);

afterAll(async () => {
  await fx?.stop();
  delete process.env.TEST_ACCOUNT_PHONES;
  delete process.env.TEST_ACCOUNT_PASSWORD;
  _resetPasswordBypassForTest();
  resetRateLimiter();
}, 60_000);

describe('journey: password login → project → report → cleanup (TWILIO_LIVE=1)', () => {
  it('stitches a password-issued token through CRUD without any Twilio interaction', async () => {
    const app = createApp();
    const me = await loginWithPassword(app, TEST_PHONE, TEST_PASSWORD);

    expect((await app.request('/me', { headers: me.headers })).status).toBe(200);

    const projRes = await app.request('/projects', {
      method: 'POST',
      headers: me.headers,
      body: JSON.stringify({ name: 'Password-login site' }),
    });
    expect(projRes.status).toBe(201);
    const project = (await projRes.json()) as { id: string; ownerId: string };
    expect(project.ownerId).toBe(me.userId);

    const repRes = await app.request(`/projects/${project.id}/reports`, {
      method: 'POST',
      headers: me.headers,
      body: JSON.stringify({ visitDate: '2026-05-15T08:00:00.000Z' }),
    });
    expect(repRes.status).toBe(201);
    const report = (await repRes.json()) as { number: number };

    expect(
      (await app.request(`/projects/${project.id}/reports/${report.number}`, {
        method: 'DELETE',
        headers: me.headers,
      })).status,
    ).toBe(204);
    expect(
      (await app.request(`/projects/${project.id}`, {
        method: 'DELETE',
        headers: me.headers,
      })).status,
    ).toBe(204);

    expect((await app.request('/auth/logout', { method: 'POST', headers: me.headers })).status).toBe(200);
  });
});
