/**
 * Integration tests for `POST /api/dev/last-otp` — the dev-only OTP
 * introspection used by Maestro `:mock` builds.
 *
 * Verifies the full layered defense (see docs/v4/arch-auth-and-rls.md
 * §Dev OTP introspection):
 *  - shared-secret header (constant-time compare)
 *  - email allowlist regex (only `*@e2e.harpapro.com`)
 *  - exact identifier match (no wildcard injection / suffix attack)
 *  - route absent when env.DEV_OTP_TOKEN is unset (404 from the router,
 *    not from the handler — same response).
 *
 * The shared `setup-env.ts` sets a fixed test token on
 * `process.env.DEV_OTP_TOKEN` before module load, which is what
 * `app.ts` consults at import time.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { startPg, type PgFixture } from './setup-pg.js';
import { resetPool, getPool } from '../db/client.js';

const VALID_TOKEN = process.env.DEV_OTP_TOKEN!;
const VALID_EMAIL = 'alice@e2e.harpapro.com';

let fx: PgFixture;
let createApp: typeof import('../app.js').createApp;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
  ({ createApp } = await import('../app.js'));
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

beforeEach(async () => {
  // Clean verification table — every test seeds what it needs.
  const pool = getPool();
  await pool.query(`DELETE FROM "verification"`);
});

async function seedVerification(identifier: string, code: string) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO "verification" (id, identifier, value, expires_at, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, $2, now() + interval '5 minutes', now(), now())`,
    [identifier, `${code}:0`],
  );
}

function call(
  app: ReturnType<typeof createApp>,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request('/api/dev/last-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/dev/last-otp — hardened dev OTP introspection', () => {
  it('returns the OTP for a valid token + allow-listed email + matching row', async () => {
    await seedVerification(`sign-in-otp-${VALID_EMAIL}`, '123456');
    const app = createApp();
    const res = await call(app, { email: VALID_EMAIL }, { 'x-dev-otp-token': VALID_TOKEN });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { otp: string; identifier: string };
    expect(json.otp).toBe('123456');
    expect(json.identifier).toBe(`sign-in-otp-${VALID_EMAIL}`);
  });

  it('returns 404 when the x-dev-otp-token header is missing', async () => {
    await seedVerification(`sign-in-otp-${VALID_EMAIL}`, '123456');
    const app = createApp();
    const res = await call(app, { email: VALID_EMAIL });
    expect(res.status).toBe(404);
  });

  it('returns 404 on a single-byte token mismatch', async () => {
    await seedVerification(`sign-in-otp-${VALID_EMAIL}`, '123456');
    const wrong = VALID_TOKEN.slice(0, -1) + (VALID_TOKEN.endsWith('A') ? 'B' : 'A');
    const app = createApp();
    const res = await call(app, { email: VALID_EMAIL }, { 'x-dev-otp-token': wrong });
    expect(res.status).toBe(404);
  });

  it('returns 404 for an email outside the allow-listed domain', async () => {
    await seedVerification('sign-in-otp-attacker@evil.com', '999999');
    const app = createApp();
    const res = await call(
      app,
      { email: 'attacker@evil.com' },
      { 'x-dev-otp-token': VALID_TOKEN },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for the bare root domain (harpapro.com, not e2e subdomain)', async () => {
    await seedVerification('sign-in-otp-attacker@harpapro.com', '999999');
    const app = createApp();
    const res = await call(
      app,
      { email: 'attacker@harpapro.com' },
      { 'x-dev-otp-token': VALID_TOKEN },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for a suffix-attack email (bad@e2e.harpapro.com.evil.com)', async () => {
    await seedVerification('sign-in-otp-bad@e2e.harpapro.com.evil.com', '999999');
    const app = createApp();
    const res = await call(
      app,
      { email: 'bad@e2e.harpapro.com.evil.com' },
      { 'x-dev-otp-token': VALID_TOKEN },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for a wildcard-injection payload (%@e2e.harpapro.com)', async () => {
    // Even if email regex passes %, exact match would fail. We seed a
    // legitimate row so a leak via LIKE would expose it.
    await seedVerification(`sign-in-otp-${VALID_EMAIL}`, '424242');
    const app = createApp();
    const res = await call(
      app,
      { email: '%@e2e.harpapro.com' },
      { 'x-dev-otp-token': VALID_TOKEN },
    );
    expect(res.status).toBe(404);
  });

  it('route is absent (404) when DEV_OTP_TOKEN is unset', async () => {
    vi.resetModules();
    const oldToken = process.env.DEV_OTP_TOKEN;
    delete process.env.DEV_OTP_TOKEN;
    try {
      await resetPool();
      getPool(fx.url);
      const { createApp: createAppNoToken } = await import('../app.js');
      const app = createAppNoToken();
      const res = await app.request('/api/dev/last-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: VALID_EMAIL }),
      });
      expect(res.status).toBe(404);
    } finally {
      process.env.DEV_OTP_TOKEN = oldToken;
      vi.resetModules();
      await resetPool();
      getPool(fx.url);
      ({ createApp } = await import('../app.js'));
    }
  });
});
